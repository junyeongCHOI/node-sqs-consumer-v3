import { Configs, Options } from "./types/limiter.type";

export default class Limiter {
    private interval: number = 1000;
    private invoke: number = 100;
    private options: Options = {
        async: false,
        delay: 0,
    };
    private invoked: number = 0;
    private draft: number = 0;
    private waitingRemainingMs: number | null = null;

    constructor(configs: Configs) {
        this.setConfigs(configs, true);
    }

    async exec(cb: () => any): Promise<void> {
        if (this.waitingRemainingMs) {
            await this.wait(this.waitingRemainingMs);
            // 한번 기다렸으면 더 이상 기다리지 않음.
            this.waitingRemainingMs = null;
        }

        if (this.invoked >= this.invoke) {
            await this.waitDraft();
        }

        if (this.now() >= this.draft + this.interval) {
            this.reset();
        }

        this.invoked++;

        const delay = this.options.delay; // 설정 값 바뀌기 전에 저장.
        const async = this.options.async;

        if (async) {
            await cb();
        } else {
            cb();
        }

        if (delay >= 0) {
            await this.wait(delay);
        }
    }


    setConfigs(configs: Configs, immediately: boolean = false) {
        // 설정값을 변경 시 남은 시간만큼 대기 할지 결정.
        // TODO: 원래 다음 실행 시점에 이전 config값으로 실행되어야 더 정확함, 현 구현은 async 옵션이 있을 경우 문제가 생김.
        this.waitingRemainingMs = !immediately ? this.getRemainingMs() : null;

        this.interval = configs.interval;
        this.invoke = configs.invoke;

        if (configs.options) {
            this.options = { ...this.options, ...configs.options };
        }

        this.invoked = 0;
        this.draft = this.now();
    }

    private getRemainingMs(): number {
        const remainingMs = this.draft + this.interval + 1 - this.now();
        if (remainingMs <= 0) {
            return 0;
        }
        return remainingMs;
    }

    private waitDraft(): Promise<true> {
        const remainingMs = this.getRemainingMs();
        if (!remainingMs) return Promise.resolve(true);
        return this.wait(this.draft + this.interval + 1 - this.now());
    }

    private reset(): void {
        this.invoked = 0;
        this.draft = this.now();
    }

    private async wait(t: number): Promise<true> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(true);
            }, t);
        });
    }

    private now(): number {
        return new Date().getTime();
    }
}
