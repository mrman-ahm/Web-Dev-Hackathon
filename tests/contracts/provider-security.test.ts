import { expect,it } from 'vitest';
import { StripeCredentialsSchema, RawWebhookSchema } from '../../src/contracts/integrations';
it('refuses live Stripe keys even when configuration claims test mode',()=>{
 expect(StripeCredentialsSchema.safeParse({mode:'test',secretKey:'sk_live_not_a_credential',webhookSigningSecret:'synthetic'}).success).toBe(false);
 expect(StripeCredentialsSchema.safeParse({mode:'test',secretKey:'sk_test_synthetic',webhookSigningSecret:'synthetic'}).success).toBe(true);
});
it('retains exact raw request bytes and externally configured signature URL',()=>{
 const rawBody=new TextEncoder().encode('Amount=1%2B2&Body=%E2%9C%93');
 const parsed=RawWebhookSchema.parse({rawBody,headers:new Headers({'content-type':'application/x-www-form-urlencoded'}),canonicalUrl:'https://hooks.example.test/twilio?route=a%2Bb'});
 expect(parsed.rawBody).toBe(rawBody);
 expect(parsed.canonicalUrl).toBe('https://hooks.example.test/twilio?route=a%2Bb');
});
