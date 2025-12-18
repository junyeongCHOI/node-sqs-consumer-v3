# Node SQS Consumer v3

AWS SQS JavaScript SDK v3 기반의 경량 Consumer 유틸리티입니다. TypeScript 타입, 커스터마이즈 가능한 콜백, 그리고 속도 제한/멀티 컨슈머 헬퍼를 제공하여 운영 중인 큐 워크로드를 안전하게 처리할 수 있습니다.

## 주요 특징
- TypeScript-first: `Configs`, `ErrorType` 등 모든 API가 타입으로 제공되어 IDE 가이드를 바로 활용할 수 있습니다.
- 안전한 콜백 흐름: `onReceive` → `deleteMessage(s)` → `onProcessed` 순서가 명확하며 오류는 `onError`로 한 곳에서 수집합니다.
- HTTP Keep-Alive: 기본 `https.Agent`가 SQS 롱 폴링에 맞춰 설정되어 불필요한 커넥션 생성을 줄입니다.
- 유연한 배치 삭제: `deleteMessageBatch`로 한번에 최대 10개까지 삭제하고, 실패한 항목에 대한 오류 정보도 콜백으로 확인합니다.
- Concurrency + Rate Limit: `ConcurrencyHelper`와 `Limiter`를 통해 다중 Consumer 실행과 TPS 제한을 간단히 구성할 수 있습니다.
- 배포 친화적 구조: 빌드 결과(`dist/`)만 포함되므로 패키지를 설치하면 바로 실행할 수 있습니다.

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
  // accessKeyId, secretAccessKey, region을 직접 지정해도 되고 환경 변수를 사용해도 됩니다.
  queueUrl: process.env.SQS_QUEUE_URL!,
  batchSize: 10,
  visibilityTimeout: 30,
  waitTimeSeconds: 20,
  pollingRetryTime: 10_000,
  async onReceive(messages, sqsClient) {
    if (!messages?.length) return;

    for (const message of messages) {
      console.log('Received:', message.MessageId, message.Body);
      // 비즈니스 로직...
      await app.deleteMessage(message);
    }
  },
  async onError(type, err, message, sqsClient) {
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
2. 수신한 메시지는 `onReceive(messages, sqsClient)` 콜백으로 전달됩니다.
3. 메시지를 처리한 뒤 `deleteMessage` 또는 `deleteMessagesBatch`로 큐에서 제거합니다.
4. 삭제가 성공하면 `onProcessed(message, sqsClient)`가 호출됩니다.
5. 폴링/콜백/삭제 중 오류가 발생하면 `onError(type, err, payload, sqsClient)` 한 곳으로 모아서 다룹니다.

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
| `httpsAgent` | `Agent` | 아니요 | `new Agent({ keepAlive: true })` | 기본값은 폴링 대기 시간 + 10초 타임아웃을 가진 Keep-Alive Agent입니다. |
| `onReceive` | `(messages, sqsClient) => Promise<void>` | 예 | - | 메시지 수신 콜백. `sqsClient`를 그대로 받아 추가 SDK 호출도 가능합니다. |
| `onError` | `(type, err, payload, sqsClient) => Promise<void>` | 아니요 | - | 모든 오류를 한 곳에서 처리하는 콜백. |
| `onProcessed` | `(message, sqsClient) => Promise<void>` | 아니요 | - | `deleteMessage(s)` 성공 이후 호출됩니다. |

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

### 멀티 컨슈머 + 속도 제한 (`ConcurrencyHelper`)

`ConcurrencyHelper`는 동일한 `Consumer` 구성을 여러 개 띄워 병렬로 폴링하면서, 내부적으로 `Limiter`를 통해 전체 처리 속도를 제어합니다.

```typescript
import { Consumer, ConcurrencyHelper } from 'node-sqs-consumer-v3';

const consumerConfigs = { /* Consumer Configs */ };

const helper = new ConcurrencyHelper(consumerConfigs, {
  concurrency: 4,      // 동시에 실행할 Consumer 수
  interval: 1000,      // 제한 기간(ms)
  invoke: 200,         // 기간 내 실행 가능한 onReceive 횟수
  options: {
    async: true,       // limiter.exec 콜백을 await
    delay: 5,          // 각 실행 후 추가 대기(ms)
  },
});

helper.start();
// 필요 시 helper.stop();

// 실행 중에도 속도 제한 재설정 가능
helper.setLimiterConfigs({
  interval: 2000,
  invoke: 150,
});
```

### `Limiter` 설정

`Limiter`는 독립적으로도 사용할 수 있는 간단한 토큰 버킷 형태의 속도 제한기입니다.

| 속성 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `interval` | `number` | `1000` | 윈도우 길이(ms). |
| `invoke` | `number` | `100` | 각 윈도우에서 허용할 실행 횟수. |
| `options.async` | `boolean` | `false` | `true`이면 콜백이 Promise를 반환한다고 가정하고 `await` 합니다. |
| `options.delay` | `number` | `0` | 각 실행 끝난 뒤 추가로 대기할 시간(ms). |

실행 중 `setConfigs`를 호출하면 남은 윈도우 시간만큼 대기한 후 새로운 설정을 적용합니다.

## 개발 & 빌드

```bash
npm install
npm run build
```

Webpack이 `src/`를 번들링하여 `dist/`를 생성하며, `package.json`의 `files` 필드에 맞춰 배포됩니다.

## 라이선스

[MIT](LICENSE)