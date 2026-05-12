FROM ghcr.io/dexidp/dex:v2.45.1@sha256:8499afd690c437f52301efd2b05b2455da5bd2dfc20332cd697dc9937f808462

LABEL org.opencontainers.image.source="https://github.com/vfarcic/dot-ai"
LABEL org.opencontainers.image.description="Dex OIDC provider with DevOps AI Toolkit branding"

COPY templates/ /srv/dex/web/templates/
COPY static/    /srv/dex/web/static/
COPY robots.txt /srv/dex/web/robots.txt
