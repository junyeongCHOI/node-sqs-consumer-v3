import Consumer from '../src/consumer';
import Limiter from '../src/utils/limiter';
import { Configs } from '../src/types/consumer.type';
import { SQSClient } from '@aws-sdk/client-sqs';

jest.mock('@aws-sdk/client-sqs', () => {
    const actual = jest.requireActual('@aws-sdk/client-sqs');
    return {
        ...actual,
        SQSClient: jest.fn().mockImplementation((options) => ({
            send: jest.fn(),
            __options: options,
        })),
    };
});

jest.mock('../src/utils/limiter', () => jest.fn());

type ConsumerMocks = {
    onReceive: jest.Mock;
    onError: jest.Mock;
    onProcessed: jest.Mock;
};

type CreateConsumerResult = {
    consumer: Consumer;
    mocks: ConsumerMocks;
};

const ORIGINAL_ENV = { ...process.env };

const mockedLimiter = Limiter as unknown as jest.Mock;
const mockedSQSClient = SQSClient as unknown as jest.Mock;

const createConsumer = (overrides: Partial<Configs> = {}): CreateConsumerResult => {
    const onReceive = (overrides.onReceive as jest.Mock | undefined) ?? jest.fn().mockResolvedValue(undefined);
    const onError = (overrides.onError as jest.Mock | undefined) ?? jest.fn().mockResolvedValue(undefined);
    const onProcessed = (overrides.onProcessed as jest.Mock | undefined) ?? jest.fn().mockResolvedValue(undefined);

    const configs: Configs = {
        accessKeyId: overrides.accessKeyId ?? 'access-key',
        secretAccessKey: overrides.secretAccessKey ?? 'secret-key',
        region: overrides.region ?? 'ap-northeast-2',
        queueUrl: overrides.queueUrl ?? 'https://sqs.ap-northeast-2.amazonaws.com/123/example',
        onReceive,
        onError,
        onProcessed,
        attributeNames: overrides.attributeNames ?? [],
        messageAttributeNames: overrides.messageAttributeNames ?? [],
        batchSize: overrides.batchSize ?? 10,
        visibilityTimeout: overrides.visibilityTimeout,
        waitTimeSeconds: overrides.waitTimeSeconds ?? 0,
        pollingRetryTime: overrides.pollingRetryTime ?? 0,
        httpsAgent: overrides.httpsAgent,
        concurrency: overrides.concurrency,
        limiterConfigs: overrides.limiterConfigs,
    };

    const consumer = new Consumer(configs);

    return {
        consumer,
        mocks: { onReceive, onError, onProcessed },
    };
};

describe('Consumer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...ORIGINAL_ENV };
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_REGION;
        mockedLimiter.mockReset();
        mockedSQSClient.mockClear();
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it('accessKeyId가 없으면 에러를 던진다', () => {
        expect(() =>
            new Consumer({
                queueUrl: 'queue-url',
                secretAccessKey: 'secret',
                region: 'ap-northeast-2',
                onReceive: jest.fn().mockResolvedValue(undefined),
            } as Configs)
        ).toThrow('Invalid AWS Access Key ID');
    });

    it('환경 변수 자격 증명을 사용해 SQSClient를 초기화한다', () => {
        process.env.AWS_ACCESS_KEY_ID = 'env-key';
        process.env.AWS_SECRET_ACCESS_KEY = 'env-secret';
        process.env.AWS_REGION = 'env-region';

        new Consumer({
            queueUrl: 'queue-url',
            onReceive: jest.fn().mockResolvedValue(undefined),
        } as Configs);

        expect(mockedSQSClient).toHaveBeenCalledTimes(1);
        const clientArgs = mockedSQSClient.mock.calls[0][0];
        expect(clientArgs.credentials.accessKeyId).toBe('env-key');
        expect(clientArgs.credentials.secretAccessKey).toBe('env-secret');
        expect(clientArgs.region).toBe('env-region');
    });

    it('start는 concurrency만큼 runPollingLoop를 호출하고 중복 호출을 방지한다', () => {
        const { consumer } = createConsumer({ concurrency: 3 });
        const runLoopSpy = jest.spyOn<any, any>(consumer as any, 'runPollingLoop').mockResolvedValue(undefined);

        consumer.start();
        expect(runLoopSpy).toHaveBeenCalledTimes(3);

        consumer.start();
        expect(runLoopSpy).toHaveBeenCalledTimes(3);
    });

    it('stop은 stopped 플래그를 true로 만든다', () => {
        const { consumer } = createConsumer();
        (consumer as any).stopped = false;
        consumer.stop();
        expect((consumer as any).stopped).toBe(true);
    });

    it('runPollingLoop는 메시지를 수신하면 onReceive를 호출한다', async () => {
        const { consumer, mocks } = createConsumer();
        const messages = [{ MessageId: '1' }];
        const sendMock = jest.fn().mockImplementation(async () => {
            consumer.stop();
            return { Messages: messages };
        });
        (consumer as any).sqsClient.send = sendMock;
        (consumer as any).stopped = false;

        await (consumer as any).runPollingLoop();

        expect(sendMock).toHaveBeenCalled();
        expect(mocks.onReceive).toHaveBeenCalledWith(messages);
    });

    it('onReceive에서 오류가 발생하면 onError가 onReceive 타입으로 호출된다', async () => {
        const receiveError = new Error('receive failed');
        const { consumer, mocks } = createConsumer({
            onReceive: jest.fn().mockRejectedValue(receiveError),
        });
        const messages = [{ MessageId: '1' }];
        const sendMock = jest.fn().mockImplementation(async () => {
            consumer.stop();
            return { Messages: messages };
        });
        (consumer as any).sqsClient.send = sendMock;
        (consumer as any).stopped = false;

        await (consumer as any).runPollingLoop();

        expect(mocks.onError).toHaveBeenCalledWith('onReceive', receiveError, messages);
    });

    it('Limiter가 있으면 각 메시지를 exec를 통해 처리한다', async () => {
        const limiterExec = jest.fn().mockImplementation(async (cb: () => Promise<void>) => {
            await cb();
        });
        mockedLimiter.mockImplementation(() => ({ exec: limiterExec }));

        const { consumer, mocks } = createConsumer({
            limiterConfigs: { interval: 1000, invoke: 2 },
        });

        const messages = [
            { MessageId: '1', ReceiptHandle: 'a' },
            { MessageId: '2', ReceiptHandle: 'b' },
        ];

        const sendMock = jest.fn().mockImplementation(async () => {
            consumer.stop();
            return { Messages: messages };
        });
        (consumer as any).sqsClient.send = sendMock;
        (consumer as any).stopped = false;

        await (consumer as any).runPollingLoop();

        expect(limiterExec).toHaveBeenCalledTimes(2);
        expect(mocks.onReceive).toHaveBeenCalledTimes(2);
        expect(mocks.onReceive).toHaveBeenNthCalledWith(1, [messages[0]]);
        expect(mocks.onReceive).toHaveBeenNthCalledWith(2, [messages[1]]);
    });

    it('폴링 중 오류가 발생하면 onError가 호출되고 재시도 후 중지된다', async () => {
        const { consumer, mocks } = createConsumer();
        const error = new Error('network');
        const sendMock = jest
            .fn()
            .mockRejectedValueOnce(error)
            .mockImplementationOnce(async () => {
                consumer.stop();
                return {};
            });

        (consumer as any).sqsClient.send = sendMock;
        (consumer as any).pollingRetryTime = 0;
        (consumer as any).stopped = false;

        await (consumer as any).runPollingLoop();

        expect(mocks.onError).toHaveBeenCalledWith('polling', error, null);
        expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it('deleteMessage 성공 시 onProcessed를 호출한다', async () => {
        const { consumer, mocks } = createConsumer();
        const message = { ReceiptHandle: 'handle', Body: 'payload' } as any;
        const sendMock = jest.fn().mockResolvedValue(undefined);
        (consumer as any).sqsClient.send = sendMock;

        await consumer.deleteMessage(message);

        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(mocks.onProcessed).toHaveBeenCalledWith(message);
    });

    it('onProcessed에서 오류가 발생하면 onError가 onProcessed 타입으로 호출된다', async () => {
        const processError = new Error('processed failed');
        const { consumer, mocks } = createConsumer({
            onProcessed: jest.fn().mockRejectedValue(processError),
        });
        const message = { ReceiptHandle: 'handle' } as any;
        const sendMock = jest.fn().mockResolvedValue(undefined);
        (consumer as any).sqsClient.send = sendMock;

        await consumer.deleteMessage(message);

        expect(mocks.onError).toHaveBeenCalledWith('onProcessed', processError, message);
    });

    it('deleteMessage 실패 시 onError가 호출된다', async () => {
        const { consumer, mocks } = createConsumer();
        const message = { ReceiptHandle: 'handle' } as any;
        const error = new Error('delete failed');
        const sendMock = jest.fn().mockRejectedValue(error);
        (consumer as any).sqsClient.send = sendMock;

        await consumer.deleteMessage(message);

        expect(mocks.onError).toHaveBeenCalledWith('deleteMessage', error, message);
    });

    it('ReceiptHandle이 없는 메시지만 주어지면 deleteMessagesBatch는 onError를 호출한다', async () => {
        const { consumer, mocks } = createConsumer();
        await consumer.deleteMessagesBatch([{ MessageId: 'no-receipt' } as any]);
        expect(mocks.onError).toHaveBeenCalledWith(
            'deleteMessageBatch',
            expect.any(Error),
            [{ MessageId: 'no-receipt' }]
        );
    });

    it('deleteMessagesBatch는 빈 배열이면 아무 작업도 하지 않는다', async () => {
        const { consumer } = createConsumer();
        const sendMock = jest.fn();
        (consumer as any).sqsClient.send = sendMock;

        await consumer.deleteMessagesBatch([]);

        expect(sendMock).not.toHaveBeenCalled();
    });

    it('deleteMessagesBatch는 성공/실패 항목에 따라 onProcessed와 onError를 구분 호출한다', async () => {
        const { consumer, mocks } = createConsumer();
        const first = { ReceiptHandle: 'a', MessageId: '1' } as any;
        const second = { ReceiptHandle: 'b', MessageId: '2' } as any;
        let successId = '';
        let failedId = '';
        const sendMock = jest.fn().mockImplementation(async (command: any) => {
            const entries = command.input.Entries;
            successId = entries[0].Id;
            failedId = entries[1].Id;
            return {
                Successful: [{ Id: successId }],
                Failed: [{ Id: failedId, Message: 'boom' }],
            };
        });
        (consumer as any).sqsClient.send = sendMock;

        await consumer.deleteMessagesBatch([first, second]);

        expect(mocks.onProcessed).toHaveBeenCalledWith(first);
        expect(mocks.onError).toHaveBeenCalledWith('deleteMessageBatch', { Id: failedId, Message: 'boom' }, second);
    });

    it('deleteMessagesBatch 실행 자체가 실패하면 모든 유효 메시지와 함께 onError를 호출한다', async () => {
        const { consumer, mocks } = createConsumer();
        const valid = { ReceiptHandle: 'handle', MessageId: '10' } as any;
        const error = new Error('batch failed');
        const sendMock = jest.fn().mockRejectedValue(error);
        (consumer as any).sqsClient.send = sendMock;

        await consumer.deleteMessagesBatch([valid]);

        expect(mocks.onError).toHaveBeenCalledWith('deleteMessageBatch', error, [valid]);
    });
});
