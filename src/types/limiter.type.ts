export type Options = {
    async: boolean;
    delay: number;
};

export type Configs = {
    interval: number;
    invoke: number;
    options?: Partial<Options>;
};
