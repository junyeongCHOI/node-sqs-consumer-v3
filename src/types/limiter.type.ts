export type Options = {
    async: boolean;
    delay: number;
};

export type LimiterConfigs = {
    interval: number;
    invoke: number;
    options?: Partial<Options>;
};
