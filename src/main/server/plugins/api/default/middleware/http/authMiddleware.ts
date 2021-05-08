import * as WS from "@trufflesuite/uws-js-unofficial";
import { Response } from "../../helpers/response";
import { AuthApi } from "../../common/auth";
import { UpgradedHttp } from "../../types";

export class AuthMiddleware {
    public static async middleware(res: WS.HttpResponse, req: WS.HttpRequest) {
        // Re-brand the context with our extra stuff
        const context = req as UpgradedHttp;

        const fail = (msg: string) => {
            context.hasEnded = true;
            Response.unauthorized(res, 401, msg);
        };

        // Pull out the auth token out of the headers or URL params
        const token = (context?.headers?.authorization ?? context.params.Authorization ?? "") as string;
        if (!token || token.length === 0) {
            fail('Missing "Authorization" header');
        } else if (token && !token.startsWith("Bearer ")) {
            fail("Invalid Authorization token! Token must be a `Bearer` token.");
        } else {
            const tokenValue = token.split("Bearer ")[1];
            const dbToken = await AuthApi.getToken(context.plugin.db, tokenValue);
            if (!dbToken) {
                fail("Invalid Token");
            } else {
                // Inject the valid auth
                context.auth = dbToken;
            }
        }
    }
}
