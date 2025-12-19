import Limiter from '../src/utils/limiter';

describe('Limiter', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('invoke 한도를 초과하면 waitDraft를 호출해 다음 실행을 지연한다', async () => {
        const limiter = new Limiter({ interval: 1000, invoke: 2 });
        const waitDraftSpy = jest.spyOn(limiter as any, 'waitDraft').mockResolvedValue(true as const);
        const waitSpy = jest.spyOn(limiter as any, 'waitMs').mockResolvedValue(true as const);
        const task = jest.fn();

        await limiter.exec(task);
        await limiter.exec(task);
        await limiter.exec(task);

        expect(waitDraftSpy).toHaveBeenCalledTimes(1);
        expect(task).toHaveBeenCalledTimes(3);

        waitDraftSpy.mockRestore();
        waitSpy.mockRestore();
    });

    it('setConfigs를 즉시 적용하지 않으면 남은 시간만큼 대기한다', async () => {
        const limiter = new Limiter({ interval: 1000, invoke: 1 });
        const waitSpy = jest.spyOn(limiter as any, 'waitMs').mockResolvedValue(true as const);
        const remainingSpy = jest.spyOn(limiter as any, 'getRemainingMs').mockReturnValue(150);

        limiter.setConfigs({ interval: 500, invoke: 1 }, false);
        await limiter.exec(jest.fn());

        expect(waitSpy).toHaveBeenCalled();
        expect(waitSpy.mock.calls[0][0]).toBe(150);

        waitSpy.mockRestore();
        remainingSpy.mockRestore();
    });

    it('delay 옵션이 설정되면 콜백 이후 지정된 시간만큼 대기한다', async () => {
        const limiter = new Limiter({ interval: 1000, invoke: 2, options: { delay: 25 } });
        const waitSpy = jest.spyOn(limiter as any, 'waitMs').mockResolvedValue(true as const);
        const task = jest.fn();

        await limiter.exec(task);

        expect(task).toHaveBeenCalledTimes(1);
        expect(waitSpy).toHaveBeenCalledWith(25);

        waitSpy.mockRestore();
    });
});
