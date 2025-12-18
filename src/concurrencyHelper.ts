import Consumer from "./consumer";
import { Configs as ConsumerConfigs } from "./types/consumer.type";
import Limiter from "./limiter";
import { Configs as LimiterConfigs } from "./types/limiter.type";

export default class ConcurrencyHelper {
    private concurrency: number = 1;
    private limiter: Limiter;
    private consumers: Consumer[] = [];

    constructor(consumerConfigs: ConsumerConfigs, concurrencyConfigs: LimiterConfigs & { concurrency: number }) {
        const { concurrency, ...limiterConfigs } = concurrencyConfigs;
        this.concurrency = concurrency;
        this.limiter = new Limiter(limiterConfigs);
        this.consumers = [];

        for (let i = 0; i < this.concurrency; i++) {
            this.consumers.push(new Consumer({
                ...consumerConfigs, onReceive: async (messages, sqsClient) => {
                    await this.limiter.exec(async () => {
                        await consumerConfigs.onReceive(messages, sqsClient);
                    });
                }
            }));
        }

    }

    start() {
        for (const consumer of this.consumers) {
            consumer.start();
        }
    }

    stop() {
        for (const consumer of this.consumers) {
            consumer.stop();
        }
    }

    setLimiterConfigs(limiterConfigs: LimiterConfigs) {
        this.limiter.setConfigs(limiterConfigs);
    }
}