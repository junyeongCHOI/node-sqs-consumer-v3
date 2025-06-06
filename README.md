# Node SQS Consumer v3

AWS SQS javascript SDK v3를 사용하는 SQS consumer 라이브러리입니다.

```typescript
import Consumer from 'node-sqs-consumer-v3';
import { Message } from '@aws-sdk/client-sqs';

// AWS 자격 증명 및 리전은 환경 변수(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION) 또는
// 아래와 같이 직접 설정해야 합니다.
const app = new Consumer({
  // accessKeyId: 'YOUR_AWS_ACCESS_KEY_ID', // 직접 설정하거나 환경 변수 사용
  // secretAccessKey: 'YOUR_AWS_SECRET_ACCESS_KEY', // 직접 설정하거나 환경 변수 사용
  // region: 'ap-northeast-2', // AWS 리전 (환경 변수 AWS_REGION 또는 직접 설정)
  queueUrl: 'YOUR_QUEUE_URL', // SQS 큐 URL
  batchSize: 10, // 한 번에 가져올 메시지 수 (기본값: 10)
  visibilityTimeout: 30, // 메시지 가시성 제한 시간 (초, 기본값: SQS 큐 설정 따름)
  waitTimeSeconds: 20, // Long polling 대기 시간 (초, 기본값: 20)
  pollingRetryTime: 10000, // 폴링 실패 시 재시도 대기 시간 (ms, 기본값: 10000)
  // httpsAgent: new Agent({ keepAlive: true }), // 선택 사항: 사용자 정의 httpsAgent
  async onReceive(messages: Message[] | undefined) {
    if (messages && messages.length > 0) {
      for (const message of messages) {
        console.log('Received message:', message.Body);
        // 메시지 처리 로직
        // 성공적으로 처리된 메시지는 삭제해야 합니다.
        await app.deleteMessage(message);
      }
    }
  },
  async onError(type, err, message) {
    console.error(`Error type: ${type}`, err, message);
    // 에러 처리 로직
  },
  async onProcessed(message) {
    console.log('Processed and deleted message:', message.MessageId);
    // 메시지 삭제 후 처리 로직
  },
});

app.start();

// app.stop();
```

## 설정 ([`Configs`](src/index.ts))

| 속성                  | 타입                                                                 | 필수 | 기본값                                     | 설명                                                                 |
| --------------------- | -------------------------------------------------------------------- | ---- | ------------------------------------------ | -------------------------------------------------------------------- |
| `accessKeyId`         | `string`                                                             | 예   | `process.env.AWS_ACCESS_KEY_ID`            | AWS 접근 키 ID (없으면 에러 발생)                                       |
| `secretAccessKey`     | `string`                                                             | 예   | `process.env.AWS_SECRET_ACCESS_KEY`        | AWS 비밀 접근 키 (없으면 에러 발생)                                     |
| `region`              | `string`                                                             | 예   | `process.env.AWS_REGION`                   | AWS 리전 (없으면 에러 발생)                                            |
| `queueUrl`            | `string`                                                             | 예   |                                            | SQS 큐 URL                                                           |
| `attributeNames`      | `string[]`                                                           | 아니요 | `[]`                                       | 가져올 메시지 속성 이름 배열                                               |
| `messageAttributeNames` | `string[]`                                                           | 아니요 | `[]`                                       | 가져올 메시지 사용자 정의 속성 이름 배열                                     |
| `batchSize`           | `number`                                                             | 아니요 | `10`                                       | 한 번의 `ReceiveMessage` 호출에서 가져올 최대 메시지 수 (1에서 10 사이)        |
| `visibilityTimeout`   | `number`                                                             | 아니요 | SQS 큐 설정 따름                           | 메시지를 받은 후 다른 consumer에게 보이지 않게 되는 시간 (초)                  |
| `waitTimeSeconds`     | `number`                                                             | 아니요 | `20`                                       | `ReceiveMessage` 호출이 메시지를 기다리는 시간 (초, Long Polling 활성화) |
| `pollingRetryTime`    | `number`                                                             | 아니요 | `10000`                                    | 폴링 중 에러 발생 시 재시도까지 대기하는 시간 (밀리초)                       |
| `httpsAgent`          | `Agent`                                                              | 아니요 | `new Agent({ keepAlive: true })`           | SQS 클라이언트용 HTTPS Agent                                             |
| `onReceive`           | `(message: Message[] | undefined) => Promise<void>`                 | 예   |                                            | 메시지를 받았을 때 호출되는 콜백 함수                                      |
| `onError`             | `(type: ErrorType, err: any, message: Message[] | Message | undefined) => Promise<void>` | 아니요 |                                            | 에러 발생 시 호출되는 콜백 함수                                          |
| `onProcessed`         | `(message: Message) => Promise<void>`                                | 아니요 |                                            | 메시지가 성공적으로 처리되고 삭제된 후 호출되는 콜백 함수                    |

### `ErrorType`

`onError` 콜백의 `type` 매개변수는 다음 값 중 하나를 가질 수 있습니다:
- `'polling'`: 메시지를 가져오는 동안 에러 발생
- `'onReceive'`: `onReceive` 콜백 실행 중 에러 발생
- `'onProcessed'`: `onProcessed` 콜백 실행 중 에러 발생
- `'deleteMessage'`: 메시지 삭제 중 에러 발생
- `'deleteMessageBatch'`: 메시지 일괄 삭제 중 에러 발생

## 라이선스

[MIT](LICENSE)