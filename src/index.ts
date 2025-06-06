import {
  DeleteMessageBatchCommand,
  DeleteMessageBatchRequestEntry,
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import { randomUUID } from 'crypto';
import { Agent } from 'https';

// SQS 메시지 또는 메시지 배열의 타입 별칭
type Messages = Message[] | undefined;

/**
 * SQS 큐에서 메시지를 성공적으로 수신했을 때 호출되는 콜백 함수입니다.
 * @param messages 수신된 SQS 메시지 객체 배열 또는 undefined.
 */
type OnReceive = (messages: Messages) => Promise<void>;

/**
 * 메시지가 성공적으로 처리되고 SQS 큐에서 삭제된 후 호출되는 콜백 함수입니다.
 * 이 함수는 메시지가 SQS에서 삭제되었음이 확인된 후에 호출됩니다.
 * @param message 처리되고 삭제된 SQS 메시지 객체.
 */
type OnProcessed = (message: Message) => Promise<void>;

// 발생 가능한 오류 유형 정의
type ErrorType = 'polling' | 'onReceive' | 'onProcessed' | 'deleteMessage' | 'deleteMessageBatch';

/**
 * 오류 발생 시 호출되는 콜백 함수입니다.
 * @param type 발생한 오류의 유형입니다.
 * @param err 발생한 오류 객체입니다.
 * @param message 오류 발생 시 관련 메시지(들). 단일 메시지 또는 메시지 배열일 수 있습니다.
 */
type OnError = (type: ErrorType, err: any, message?: Messages | Message) => Promise<void>;

/**
 * Consumer 설정 객체 타입 정의
 */
type Configs = {
  accessKeyId?: string; // AWS 접근 키 ID (환경 변수 AWS_ACCESS_KEY_ID로도 설정 가능)
  secretAccessKey?: string; // AWS 비밀 접근 키 (환경 변수 AWS_SECRET_ACCESS_KEY로도 설정 가능)
  region?: string; // AWS 리전 (환경 변수 AWS_REGION으로도 설정 가능)
  queueUrl: string; // SQS 큐 URL
  attributeNames?: string[]; // 수신할 메시지의 속성 이름 배열
  messageAttributeNames?: string[]; // 수신할 메시지의 메시지 속성 이름 배열
  batchSize?: number; // 한 번에 수신할 최대 메시지 수 (기본값: 10)
  visibilityTimeout?: number; // 메시지 가시성 제한 시간(초)
  waitTimeSeconds?: number; // 롱 폴링 대기 시간(초) (기본값: 20)
  pollingRetryTime?: number; // 폴링 재시도 간격(밀리초) (기본값: 10000)
  httpsAgent?: Agent; // HTTPS 요청에 사용할 사용자 정의 Agent
  onReceive: OnReceive; // 메시지 수신 시 실행될 콜백 함수
  onError?: OnError; // 오류 발생 시 실행될 콜백 함수
  /**
   * 메시지가 성공적으로 처리되고 SQS 큐에서 삭제된 후 호출되는 선택적 콜백 함수입니다.
   * 이 함수는 메시지가 SQS에서 삭제되었음이 확인된 후에 호출됩니다.
   */
  onProcessed?: OnProcessed; // 메시지 처리 및 삭제 후 실행될 콜백 함수
};

/**
 * AWS SQS Consumer 클래스
 */
export default class Consumer {
  private readonly sqsClient: SQSClient; // SQS 클라이언트 인스턴스
  private readonly queueUrl: string; // SQS 큐 URL
  private readonly attributeNames: string[]; // 메시지 속성 이름
  private readonly messageAttributeNames: string[]; // 메시지 사용자 정의 속성 이름
  private readonly batchSize: number; // 배치 크기
  private readonly visibilityTimeout?: number; // 가시성 제한 시간
  private readonly waitTimeSeconds: number; // 롱 폴링 대기 시간
  private readonly pollingRetryTime: number; // 폴링 재시도 시간
  private readonly onReceive: OnReceive; // 메시지 수신 콜백
  private readonly onError?: OnError; // 오류 콜백
  /**
   * 메시지가 성공적으로 처리되고 SQS 큐에서 삭제된 후 호출되는 선택적 콜백 함수입니다.
   * 이 함수는 메시지가 SQS에서 삭제되었음이 확인된 후에 호출됩니다.
   */
  private readonly onProcessed?: OnProcessed; // 메시지 처리 완료 콜백
  private stopped: boolean = true; // Consumer 중지 상태 플래그

  /**
   * Consumer 인스턴스를 생성합니다.
   * @param configs Consumer 설정 객체
   */
  constructor(configs: Configs) {
    this.queueUrl = configs.queueUrl;
    this.attributeNames = configs.attributeNames || [];
    this.messageAttributeNames = configs.messageAttributeNames || [];
    this.batchSize = configs.batchSize || 10; // 기본 배치 크기 10으로 설정
    this.visibilityTimeout = configs.visibilityTimeout;
    this.waitTimeSeconds = configs.waitTimeSeconds ?? 20; // 기본 대기 시간 20초로 설정 (nullish coalescing)
    this.pollingRetryTime = configs.pollingRetryTime ?? 10000; // 기본 폴링 재시도 시간 10초로 설정
    this.onReceive = configs.onReceive;
    this.onError = configs.onError;
    this.onProcessed = configs.onProcessed;

    const accessKeyId = configs.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = configs.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    const region = configs.region || process.env.AWS_REGION;

    if (!accessKeyId) {
      throw new Error('Invalid AWS Access Key ID. (configs.accessKeyId or process.env.AWS_ACCESS_KEY_ID)');
    }
    if (!secretAccessKey) {
      throw new Error('Invalid AWS Secret Access Key. (configs.secretAccessKey or process.env.AWS_SECRET_ACCESS_KEY)');
    }
    if (!region) {
      throw new Error('Invalid AWS Region. (configs.region or process.env.AWS_REGION)');
    }

    this.sqsClient = new SQSClient({
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
      region: region,
      requestHandler: new NodeHttpHandler({
        httpsAgent:
          configs.httpsAgent ||
          new Agent({
            keepAlive: true,
            timeout: this.waitTimeSeconds * 1000 + 10 * 1000,
          }),
      }),
    });
  }

  /**
   * SQS 메시지 폴링을 시작합니다.
   * 이미 시작된 경우 아무 작업도 수행하지 않습니다.
   */
  start() {
    if (!this.stopped) return; // 이미 실행 중이면 반환

    this.stopped = false;
    this.runPollingLoop(); // 폴링 루프 시작
  }

  /**
   * SQS 메시지 폴링을 중지합니다.
   * 현재 폴링된 메시지는 계속 처리되지만, 이후 폴링은 중지됩니다.
   */
  stop() {
    this.stopped = true; // 중지 플래그 설정
  }

  /**
   * SQS 큐에서 메시지를 지속적으로 폴링하는 내부 루프입니다.
   * `stopped` 플래그가 true가 될 때까지 실행됩니다.
   */
  private async runPollingLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        const data = await this.sqsClient.send(
          new ReceiveMessageCommand({
            AttributeNames: this.attributeNames,
            MessageAttributeNames: this.messageAttributeNames,
            MaxNumberOfMessages: this.batchSize,
            QueueUrl: this.queueUrl,
            WaitTimeSeconds: this.waitTimeSeconds,
            VisibilityTimeout: this.visibilityTimeout,
          })
        );
        // 메시지 수신 콜백 실행
        await this.execOnReceive(data.Messages);
      } catch (err) {
        // 폴링 중 오류 발생 시 오류 콜백 실행
        this.execOnError('polling', err);
        if (this.stopped) {
          break; // 중지된 경우 루프 종료
        }
        // 설정된 재시도 시간만큼 대기 후 다시 시도
        await new Promise((resolve) => setTimeout(resolve, this.pollingRetryTime));
      }
    }
  }

  /**
   * 단일 메시지를 SQS 큐에서 삭제합니다.
   * @param message 삭제할 SQS 메시지 객체. `ReceiptHandle`이 반드시 포함되어야 합니다.
   */
  async deleteMessage(message: Message) {
    try {
      await this.sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        })
      );
      // 메시지 처리 완료 콜백 실행
      this.execOnProcessed(message);
    } catch (err) {
      // 메시지 삭제 중 오류 발생 시 오류 콜백 실행
      this.execOnError('deleteMessage', err, message);
    }
  }

  /**
   * SQS 큐에서 여러 메시지를 일괄 삭제합니다.
   * 성공적으로 삭제된 각 메시지에 대해 `onProcessed` 콜백(설정된 경우)이 호출됩니다.
   * 삭제에 실패한 각 메시지에 대해 `onError` 콜백(설정된 경우)이 'deleteMessageBatch' 타입으로 호출됩니다.
   * 전체 일괄 삭제 명령이 실패하는 경우(예: 네트워크 문제), 시도된 모든 메시지와 함께 `onError`가 한 번 호출됩니다.
   * @param messagesToDelete 삭제할 SQS 메시지 객체 배열. 각 메시지는 `ReceiptHandle`을 가져야 합니다.
   */
  async deleteMessagesBatch(messagesToDelete: Message[]): Promise<void> {
    if (!messagesToDelete || messagesToDelete.length === 0) {
      return; // 삭제할 메시지가 없으면 반환
    }

    // ReceiptHandle이 있는 유효한 메시지만 필터링
    const validMessages = messagesToDelete.filter((msg) => msg.ReceiptHandle);

    if (validMessages.length === 0) {
      if (messagesToDelete.length > 0) {
        // 제공된 모든 메시지에 ReceiptHandle이 없는 경우 오류 처리
        this.execOnError('deleteMessageBatch', new Error('All provided messages are missing ReceiptHandle.'), messagesToDelete);
      }
      return;
    }

    // 배치 작업 내에서 각 메시지를 고유하게 식별하고, 작업 후 원래 메시지 객체에 매핑하기 위한 임시 ID 사용
    const tempIdToMessageMap = new Map<string, Message>();
    const batchEntries: DeleteMessageBatchRequestEntry[] = validMessages.map((msg) => {
      const tempId = randomUUID(); // 각 메시지에 대한 고유 임시 ID 생성 (crypto 모듈 사용)
      tempIdToMessageMap.set(tempId, msg);
      return {
        Id: tempId,
        ReceiptHandle: msg.ReceiptHandle!, // 위에서 필터링 했으므로 ReceiptHandle은 반드시 존재
      };
    });

    if (batchEntries.length === 0) {
      return; // 실제 삭제할 항목이 없으면 반환 (이론상 validMessages가 아이템을 가졌다면 발생하지 않음)
    }

    try {
      const result = await this.sqsClient.send(
        new DeleteMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: batchEntries,
        })
      );

      // 성공적으로 삭제된 메시지 처리
      if (result.Successful) {
        for (const successEntry of result.Successful) {
          if (successEntry.Id) {
            const originalMessage = tempIdToMessageMap.get(successEntry.Id);
            if (originalMessage) {
              this.execOnProcessed(originalMessage);
            }
          }
        }
      }

      // 삭제에 실패한 메시지 처리
      if (result.Failed) {
        for (const failedEntry of result.Failed) {
          if (failedEntry.Id) {
            const originalMessage = tempIdToMessageMap.get(failedEntry.Id);
            if (originalMessage) {
              this.execOnError('deleteMessageBatch', failedEntry, originalMessage);
            } else {
              // 임시 ID 매핑에 문제가 발생한 경우 (내부 오류)
              this.execOnError('deleteMessageBatch', { ...failedEntry }, undefined);
            }
          }
        }
      }
    } catch (err) {
      // 전체 배치 명령 실행 중 오류 발생 시
      this.execOnError('deleteMessageBatch', err, validMessages);
    }
  }

  /**
   * @param message 수신된 SQS 메시지(들)
   */
  private async execOnReceive(message: Messages) {
    try {
      await this.onReceive(message);
    } catch (err) {
      this.execOnError('onReceive', err, message);
    }
  }

  /**
   * `onError` 콜백 자체가 오류를 발생시키면 콘솔에 에러를 출력합니다.
   * @param type 오류 유형
   * @param err 발생한 오류 객체
   * @param message 관련 메시지(들)
   */
  private async execOnError(type: ErrorType, err: any, message?: Messages | Message) {
    try {
      if (!this.onError) return; // onError 콜백이 설정되지 않았으면 반환
      await this.onError(type, err, message);
    } catch (errInOnError) {
      // onError 콜백 실행 중 발생한 오류는 콘솔에 직접 출력 (무한 루프 방지)
      console.error('onError', errInOnError);
      // throw errInOnError; // ??
    }
  }

  /**
   * 이 메서드는 SQS에서 메시지가 성공적으로 삭제된 후 내부적으로 호출됩니다.
   * @param message 처리되고 삭제된 SQS 메시지 객체.
   */
  private async execOnProcessed(message: Message) {
    try {
      if (!this.onProcessed) return; // onProcessed 콜백이 설정되지 않았으면 반환
      await this.onProcessed(message);
    } catch (err) {
      this.execOnError('onProcessed', err, message);
    }
  }
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      AWS_REGION?: string;
      AWS_ACCESS_KEY_ID?: string;
      AWS_SECRET_ACCESS_KEY?: string;
    }
  }
}
