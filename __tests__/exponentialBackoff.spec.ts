import { exponentialBackoff } from '../src/utils/exponentialBackoff';

const mockImmediateTimeout = () =>
    jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: any[]) => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

describe('exponentialBackoff', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('첫 시도에서 성공하면 지연 없이 결과를 반환한다', async () => {
        const setTimeoutSpy = mockImmediateTimeout();
        const mathRandomSpy = jest.spyOn(Math, 'random');
        const task = jest.fn().mockResolvedValue('ok');

        const result = await exponentialBackoff(task);

        expect(result).toBe('ok');
        expect(task).toHaveBeenCalledTimes(1);
        expect(setTimeoutSpy).not.toHaveBeenCalled();
        expect(mathRandomSpy).not.toHaveBeenCalled();
    });

    it('실패 후 재시도하여 성공하면 결과를 반환한다', async () => {
        const setTimeoutSpy = mockImmediateTimeout();
        const mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

        const task = jest
            .fn()
            .mockRejectedValueOnce(new Error('first'))
            .mockRejectedValueOnce(new Error('second'))
            .mockResolvedValue('finally');

        const result = await exponentialBackoff(task, 5, { baseDelayMs: 100, maxDelayMs: 1000 });

        expect(result).toBe('finally');
        expect(task).toHaveBeenCalledTimes(3);
        expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
        expect(setTimeoutSpy.mock.calls.map(([, delay]) => delay)).toEqual([100, 200]); // base=100, attempt index가 1부터 증가
        expect(mathRandomSpy).toHaveBeenCalledTimes(2);
    });

    it('모든 시도가 실패하면 마지막 오류로 reject한다', async () => {
        mockImmediateTimeout();
        jest.spyOn(Math, 'random').mockReturnValue(0.5);

        const task = jest.fn().mockRejectedValue(new Error('always fail'));

        await expect(exponentialBackoff(task, 3)).rejects.toThrow('always fail');
        expect(task).toHaveBeenCalledTimes(3);
    });
});
