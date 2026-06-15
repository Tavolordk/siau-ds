import { Observable } from 'rxjs';
import {
    CaptchaChallenge,
    CaptchaGenerationOptions,
    CaptchaVerification,
    CaptchaVerifyCommand,
} from './captcha.model';

export abstract class CaptchaRepository {
    abstract generate(options?: CaptchaGenerationOptions): Observable<CaptchaChallenge>;

    abstract verify(command: CaptchaVerifyCommand): Observable<CaptchaVerification>;
}