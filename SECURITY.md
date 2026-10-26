# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- the **API key** of the Shlink server, stored by Gladys in the integration
  configuration (never written to `/data`, never logged); it is only sent to
  the address configured, and redirects are not followed so it never reaches
  another host;
- the visits read from Shlink (date, country, referring site, bot flag): kept
  in memory and passed to the scene events, never logged; the referring site
  is reduced to its host;
- `/data/shlink-state.json`: what the scene triggers remember (the date of the
  newest visit seen per followed link, whether the server was reachable; no
  secret, no visitor data);
- network: HTTP(S) requests to Shlink, nothing else; no port is opened.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Shlink itself.
