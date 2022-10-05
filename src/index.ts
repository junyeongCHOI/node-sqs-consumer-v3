import { DeleteMessageCommand, Message, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import { Agent } from 'https';

type Messages = Message[] | undefined;
type OnReceive = (message: Messages) => Promise<void>;
type OnProcessed = (message: Message) => Promise<void>;
type ErrorType = 'polling' | 'onReceive' | 'onProcessed' | 'deleteMessage';
type OnError = (type: ErrorType, err: any, message: Messages | Message) => Promise<void>;

type Configs = {
  region: string;
  queueUrl: string;
  attributeNames?: string[];
  messageAttributeNames?: string[];
  batchSize?: number;
  visibilityTimeout?: number;
  waitTimeSeconds?: number;
  pollingRetryTime?: number;
  httpsAgent?: Agent;
  onReceive: OnReceive;
  onError?: OnError;
  onProcessed?: OnProcessed;
};

export default class Consumer {
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;
  private readonly attributeNames: string[];
  private readonly messageAttributeNames: string[];
  private readonly batchSize: number;
  private readonly visibilityTimeout?: number;
  private readonly waitTimeSeconds: number;
  private readonly pollingRetryTime: number;
  private readonly onReceive: OnReceive;
  private readonly onError?: OnError;
  private readonly onProcessed?: OnProcessed;
  private stopped: boolean = true;

  constructor(configs: Configs) {
    this.queueUrl = configs.queueUrl;
    this.attributeNames = configs.attributeNames || [];
    this.messageAttributeNames = configs.messageAttributeNames || [];
    this.batchSize = configs.batchSize || 10;
    this.visibilityTimeout = configs.visibilityTimeout;
    this.waitTimeSeconds = configs.waitTimeSeconds ?? 20;
    this.pollingRetryTime = configs.pollingRetryTime ?? 10000;
    this.onReceive = configs.onReceive;
    this.onError = configs.onError;
    this.onProcessed = configs.onProcessed;
    this.sqsClient = new SQSClient({
      region: configs.region || process.env.AWS_REGION,
      requestHandler: new NodeHttpHandler({
        httpsAgent: configs.httpsAgent || new Agent({ keepAlive: true }),
      }),
    });
  }

  start() {
    if (!this.stopped) return;

    this.stopped = false;
    this.poll();
  }

  stop() {
    this.stopped = true;
  }

  private async poll() {
    try {
      if (this.stopped) return;

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

      await this.execOnReceive(data.Messages);

      await this.poll();
    } catch (err) {
      setTimeout(() => this.poll(), this.pollingRetryTime);
      this.execOnError('polling', err);
    }
  }

  async deleteMessage(message: Message) {
    try {
      await this.sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        })
      );
      this.execOnProcessed(message);
    } catch (err) {
      this.execOnError('deleteMessage', err, message);
    }
  }

  private async execOnReceive(message: Messages) {
    try {
      await this.onReceive(message);
    } catch (err) {
      this.execOnError('onReceive', err, message);
    }
  }

  private async execOnError(type: ErrorType, err: any, message?: Messages | Message) {
    try {
      if (!this.onError) return;
      await this.onError(type, err, message);
    } catch (err) {
      console.error(err);
    }
  }

  private async execOnProcessed(message: Message) {
    try {
      if (!this.onProcessed) return;
      await this.onProcessed(message);
    } catch (err) {
      this.execOnError('onProcessed', err, message);
    }
  }
}
