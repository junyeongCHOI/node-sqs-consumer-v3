export async function exponentialBackoff<T>(func: () => Promise<T>, maxAttempts: number = 5, options?: ExponentialBackoffOptions): Promise<T> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const result = await func();

            return result;
        } catch (error) {
            if (attempt === maxAttempts - 1) {
                return Promise.reject(error);
            }
        }

        const delay = getExponentialBackoffDelay(attempt + 1, options);
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return Promise.reject(new Error('Max attempts reached'));
}

function getExponentialBackoffDelay(attempt: number = 0, {
    baseDelayMs,
    maxDelayMs,
}: ExponentialBackoffOptions = {
        baseDelayMs: 50, // 기본 지연 시간 50ms
        maxDelayMs: 1000, // 최대 지연 시간 1초
    }): number {
    const sanitizedAttempt = Math.max(0, Math.floor(attempt));
    const rawDelay = Math.min(baseDelayMs * Math.pow(2, sanitizedAttempt), maxDelayMs);

    return applyJitter(rawDelay);
}

function applyJitter(delay: number): number {
    const start = delay / 2;
    const spread = delay - start;

    return Math.round(start + Math.random() * spread);
}

type ExponentialBackoffOptions = {
    baseDelayMs: number;
    maxDelayMs: number;
}