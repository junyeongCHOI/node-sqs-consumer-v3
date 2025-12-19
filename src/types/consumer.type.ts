import {
    Message,
} from '@aws-sdk/client-sqs';
import { Agent } from 'https';
import { LimiterConfigs } from './limiter.type';

// SQS 메시지 또는 메시지 배열의 타입 별칭
export type Messages = Message[] | undefined;

/**
 * SQS 큐에서 메시지를 성공적으로 수신했을 때 호출되는 콜백 함수입니다.
 * @param messages 수신된 SQS 메시지 객체 배열 또는 undefined.
 */
export type OnReceive = (messages: Messages) => Promise<void>;

/**
 * 메시지가 성공적으로 처리되고 SQS 큐에서 삭제된 후 호출되는 콜백 함수입니다.
 * 이 함수는 메시지가 SQS에서 삭제되었음이 확인된 후에 호출됩니다.
 * @param message 처리되고 삭제된 SQS 메시지 객체.
 */
export type OnProcessed = (message: Message) => Promise<void>;

// 발생 가능한 오류 유형 정의
export type ErrorType = 'polling' | 'onReceive' | 'onProcessed' | 'deleteMessage' | 'deleteMessageBatch';

/**
 * 오류 발생 시 호출되는 콜백 함수입니다.
 * @param type 발생한 오류의 유형입니다.
 * @param err 발생한 오류 객체입니다.
 * @param message 오류 발생 시 관련 메시지(들). 단일 메시지 또는 메시지 배열일 수 있습니다.
 */
export type OnError = (type: ErrorType, err: unknown, message: Messages | Message | null | undefined) => Promise<void>;

/**
 * Consumer 설정 객체 타입 정의
 */
export type Configs = {
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
    concurrency?: number; // 동시에 실행할 Consumer 수
    limiterConfigs?: LimiterConfigs; // Limiter 설정
};
