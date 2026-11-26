export const MAIN_HELP = `limix-publish: sign limix rules for remote policies, publish their keys, check a token

Usage: limix-publish <command> [options]

Commands:
  sign <rules.yaml|json>   sign a rules file as a JWS token
  jwks                     print the public key set of one or more keys
  check <token-file|->     verify a token as a reader would

Run "limix-publish <command> --help" for a command's options.
Exit codes: 0 done, 1 refused, 2 wrong command line.
`;

export const SIGN_HELP = `Usage: limix-publish sign <rules.yaml|json> --key <pkcs8.pem> --kid <kid> --aud <aud> --ver <n> [options]

Validates the rules like a reader does, then signs them.

Options:
  --key <file>        PKCS#8 private key PEM (required)
  --kid <kid>         key id in the key set (required)
  --aud <aud>         audience of the token; repeat for several (required)
  --ver <n>           version, a positive integer that only goes up (required)
  --iss <iss>         issuer
  --alg <alg>         RS256, PS256, ES256 or EdDSA; inferred for EC P-256, Ed25519, RSA-PSS; required for an RSA key
  --expires <time>    lifetime: seconds, 30m, 12h or 7d; default 1d
  --conditions <a,b>  the condition names the rules' "when" may use; default any
  --out <file>        write the token here instead of stdout
  -h, --help          show this help
`;

export const JWKS_HELP = `Usage: limix-publish jwks --key <pem>:<kid> [--key <pem>:<kid> ...] [options]

Prints the public key set (JSON). A key file is an SPKI public or a PKCS#8
private PEM; the private part never reaches the output. Two keys rotate.

Options:
  --key <file>:<kid>  a key and its id (required, repeatable)
  --alg <alg>         RS256, PS256, ES256 or EdDSA; inferred for EC P-256, Ed25519, RSA-PSS; required for an RSA key
  --out <file>        write the set here instead of stdout
  -h, --help          show this help
`;

export const CHECK_HELP = `Usage: limix-publish check <token-file|-> --jwks <file> --aud <aud> [options]

Verifies a token with the checks a reader makes (@softistx/limix/remote
verifyRules) and prints its version, expiry and size. "-" reads stdin.
Exits 1 with the refusal's code and message, also for an expired token.

Options:
  --jwks <file>       the key set JSON (required)
  --aud <aud>         the audience a reader requires (required)
  --iss <iss>         the issuer a reader requires
  --conditions <a,b>  the condition names a reader registers (the same as for sign)
  -h, --help          show this help
`;
