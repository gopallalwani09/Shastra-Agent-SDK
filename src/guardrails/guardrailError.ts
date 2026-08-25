export class GuardrailError extends Error {
    public readonly reason: string;
    public readonly details?: any;

    constructor(message: string, reason: string, details?: any) {
        super(message);
        this.name = "GuardrailError";
        this.reason = reason;
        this.details = details;
        Object.setPrototypeOf(this, GuardrailError.prototype);
    }
}