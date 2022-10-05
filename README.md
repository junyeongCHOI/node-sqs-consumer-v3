# node-sqs-consumer-v3
- 기본적으로 `long-polling`을 사용.
- onReceive의 promise가 완료되지 않으면 다음 polling을 하지 않음.
- 실행 함수 내에서 `deleteMessage`를 호출해야만 SQS 대기열에서 메시지 삭제.
- 대기열에서 삭제되지 않으면 보존 기간까지 계속 노출. (visibility timeout 주기)
- 기본적으로 https agent의 keep alive 옵션이 true입니다.

## 사용
나중에 써야지 🐣

## 상세
나중에 써야지 🐣

### `new Counsumer(configs)`
나중에 써야지 🐣

#### Configs

- region - String
- queueUrl - String
- attributeNames? - String[]
- messageAttributeNames? - String[]
- batchSize - Number(Optional)
- visibilityTimeout - Number(Optional)
- waitTimeSeconds - Number(Optional)
- pollingRetryTime - Number(Optional)
- httpsAgent - Agent
- onReceive - Function
- onError - Function(Optional)
- onProcessed - Function(Optional)


## Polling 재시도

- maxReceiveCount 설정. (5 권장)
- 충분한 visibility timeout 설정. (함수 실행시간의 6배 권장)
