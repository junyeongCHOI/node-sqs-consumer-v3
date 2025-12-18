# Node SQS Consumer v3

AWS SQS JavaScript SDK v3 기반의 경량 Consumer 유틸리티입니다. 단일 `Consumer` 인스턴스로 롱 폴링, 안전한 삭제, 동시 실행, 처리량 제한까지 한 번에 구성할 수 있습니다.

## 주요 특징
- TypeScript-first: `Configs`, `ErrorType` 등 모든 API를 타입으로 제공하여 IDE에서 바로 확인할 수 있습니다.
- 단일 Consumer로 동시 폴링: `concurrency` 옵션 하나로 여러 폴링 루프를 돌리며 동일한 콜백을 재사용합니다.
- 토큰 버킷 기반 처리량 제한: `limiterConfigs`를 통해 `onReceive` 실행 빈도와 후속 지연을 제어합니다.
- HTTP Keep-Alive: 기본 `https.Agent`가 큐 롱 폴링에 맞춰 연결 수와 타임아웃을 자동으로 조정합니다.
- 유연한 삭제 유틸리티: `deleteMessage`/`deleteMessagesBatch`로 처리 흐름을 제어하고 `onProcessed`에서 후처리할 수 있습니다.
- 배포 친화적 구조: 번들 결과(`dist/`)만 포함되어 설치 즉시 실행 가능합니다.

## 목차
- [설치](#설치)
- [빠른 시작 (단일 Consumer)](#빠른-시작-단일-consumer)
- [메시지 처리 흐름](#메시지-처리-흐름)
- [Consumer 설정](#consumer-설정)
- [에러 타입](#에러-타입)
- [유틸리티 메서드](#유틸리티-메서드)
- [고급 사용법](#고급-사용법)
- [개발 & 빌드](#개발--빌드)
- [라이선스](#라이선스)

## 설치

```bash
npm install node-sqs-consumer-v3
# 또는
yarn add node-sqs-consumer-v3
```

AWS 자격 증명은 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` 환경 변수로 제공하거나 `Configs`에 직접 지정할 수 있습니다.

## 빠른 시작 (단일 Consumer)

```typescript
import Consumer from 'node-sqs-consumer-v3';
import { Message } from '@aws-sdk/client-sqs';

const app = new Consumer({
  queueUrl: process.env.SQS_QUEUE_URL!,
  batchSize: 10,
  waitTimeSeconds: 20,
  concurrency: 2,
  limiterConfigs: {
    interval: 1000,
    invoke: 200,
    options: { async: true, delay: 5 },
  },
  async onReceive(messages) {
    if (!messages?.length) return;

    for (const message of messages) {
      console.log('Received:', message.MessageId, message.Body);

      await doBusinessLogic(message);
      await app.deleteMessage(message);
    }
  },
  async onError(type, err, message) {
    console.error(`[${type}]`, err, message);
  },
  async onProcessed(message) {
    console.log('Deleted:', message.MessageId);
  },
});

app.start();
// 필요 시 app.stop();
```

> 메시지를 처리한 뒤에는 `deleteMessage` 또는 `deleteMessagesBatch`를 꼭 호출해야 재처리를 방지할 수 있습니다.

## 메시지 처리 흐름
1. `start()`가 롱 폴링을 시작하면 AWS SQS에서 메시지를 가져옵니다.
2. 수신한 메시지는 `onReceive(messages)` 콜백으로 전달됩니다.
3. 메시지를 처리한 뒤 `deleteMessage` 또는 `deleteMessagesBatch`로 큐에서 제거합니다.
4. 삭제가 성공하면 `onProcessed(message)`가 호출됩니다.
5. 폴링/콜백/삭제 중 오류가 발생하면 `onError(type, err, payload)` 한 곳에서 처리합니다.

## Consumer 설정

`Configs` 타입은 `src/types/consumer.type.ts`에 정의되어 있으며 주요 필드는 아래와 같습니다.

| 속성 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `accessKeyId` | `string` | 예 | `process.env.AWS_ACCESS_KEY_ID` | AWS 접근 키 ID. 값이 없으면 생성 시 에러가 발생합니다. |
| `secretAccessKey` | `string` | 예 | `process.env.AWS_SECRET_ACCESS_KEY` | AWS 비밀 접근 키. |
| `region` | `string` | 예 | `process.env.AWS_REGION` | AWS 리전. |
| `queueUrl` | `string` | 예 | - | 대상 SQS 큐 URL. |
| `attributeNames` | `string[]` | 아니요 | `[]` | `ReceiveMessage` 호출 시 포함할 Attribute 목록. |
| `messageAttributeNames` | `string[]` | 아니요 | `[]` | 사용자 정의 Message Attribute 목록. |
| `batchSize` | `number` | 아니요 | `10` | 1회 최대 수신 메시지 수 (SQS 제한: 1~10). |
| `visibilityTimeout` | `number` | 아니요 | 큐 설정 | 메시지 재표시 전까지 숨길 시간(초). |
| `waitTimeSeconds` | `number` | 아니요 | `20` | 롱 폴링 대기 시간(초). |
| `pollingRetryTime` | `number` | 아니요 | `10000` | 폴링 실패 시 재시도까지 대기하는 시간(ms). |
| `httpsAgent` | `Agent` | 아니요 | `new Agent({ keepAlive: true, maxSockets: concurrency * 25, timeout: waitTimeSeconds * 1000 + 10_000 })` | Keep-Alive가 적용된 기본 Agent를 커스터마이즈할 수 있습니다. |
| `onReceive` | `(messages: Message[] \| undefined) => Promise<void>` | 예 | - | 메시지 수신 콜백. 빈 응답(`undefined`)도 전달됩니다. |
| `onError` | `(type, err, payload) => Promise<void>` | 아니요 | - | 모든 오류를 한 곳에서 처리하는 콜백. |
| `onProcessed` | `(message: Message) => Promise<void>` | 아니요 | - | 삭제에 성공했을 때 후처리할 수 있는 콜백. |
| `concurrency` | `number` | 아니요 | `1` | 동시에 실행할 폴링 루프 수. 값이 클수록 병렬 처리량이 늘어납니다. |
| `limiterConfigs.interval` | `number` | 아니요 | `1000` | 토큰 버킷 윈도우 길이(ms). |
| `limiterConfigs.invoke` | `number` | 아니요 | `100` | 윈도우당 허용할 `onReceive` 호출 횟수. |
| `limiterConfigs.options.async` | `boolean` | 아니요 | `false` | 콜백이 Promise를 반환한다면 `true`로 설정해 순차적으로 대기합니다. |
| `limiterConfigs.options.delay` | `number` | 아니요 | `0` | 각 실행이 끝난 뒤 추가로 기다릴 시간(ms). |

## 에러 타입

`ErrorType`은 다음 다섯 가지 값 중 하나입니다.

- `polling`: SQS `ReceiveMessage` 호출에서 발생한 오류
- `onReceive`: `onReceive` 콜백 내부에서 발생한 오류
- `onProcessed`: `onProcessed` 콜백에서 발생한 오류
- `deleteMessage`: 단일 삭제(`deleteMessage`) 실패
- `deleteMessageBatch`: 배치 삭제(`deleteMessagesBatch`) 실패 (부분 실패 포함)

## 유틸리티 메서드
- `start()`: 폴링 루프를 시작합니다. 이미 실행 중이면 무시됩니다.
- `stop()`: 다음 폴링부터 중단하며, 현재 처리 중인 메시지는 완료까지 계속 됩니다.
- `deleteMessage(message)`: 단일 메시지를 삭제하고 `onProcessed`를 호출합니다.
- `deleteMessagesBatch(messages)`: 최대 10개의 메시지를 일괄 삭제하며, 성공/실패 각각에 대해 적절한 콜백을 호출합니다.

## 고급 사용법

### 동시 폴링 (`concurrency`)

단일 Consumer 인스턴스가 내부적으로 여러 폴링 루프를 돌리기 때문에 `concurrency`만 조정하면 됩니다. 각 루프는 동일한 `Limiter`와 콜백을 공유합니다.

```typescript
const app = new Consumer({
  queueUrl: process.env.SQS_QUEUE_URL!,
  concurrency: 4,        // 동시에 4개의 ReceiveMessage를 돌립니다.
  batchSize: 5,
  async onReceive(messages) {
    // ...
  },
  async onError(type, err, payload) {
    // ...
  },
});

app.start();
```

### 처리량 제한 (`limiterConfigs`)

내장 Limiter는 토큰 버킷 방식으로 `onReceive` 실행 빈도를 제어합니다. 설정을 전달하지 않으면 `interval=1000ms`, `invoke=100`이 기본값입니다.

```typescript
const throttled = new Consumer({
  queueUrl: process.env.SQS_QUEUE_URL!,
  limiterConfigs: {
    interval: 1000,
    invoke: 60,              // 초당 60번만 onReceive 실행
    options: { async: true, delay: 10 },
  },
  async onReceive(messages) {
    // ...
  },
  async onError(type, err, payload) {
    // ...
  },
});
```

현재 Limiter 설정은 인스턴스 생성 시에만 지정할 수 있습니다. 처리량이 급격히 달라지는 워크로드라면 여러 Consumer 인스턴스를 서로 다른 설정으로 구성하는 방법을 권장합니다.

## 개발 & 빌드

```bash
npm install
npm run build
```

Webpack이 `src/`를 번들링하여 `dist/`를 생성하며, `package.json`의 `files` 필드에 맞춰 배포됩니다.

## 라이선스

[MIT](LICENSE)