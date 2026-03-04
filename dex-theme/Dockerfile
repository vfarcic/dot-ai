FROM ghcr.io/dexidp/dex:v2.44.0

LABEL org.opencontainers.image.source="https://github.com/vfarcic/dot-ai"
LABEL org.opencontainers.image.description="Dex OIDC provider with DevOps AI Toolkit branding"

COPY templates/ /srv/dex/web/templates/
COPY static/    /srv/dex/web/static/
COPY robots.txt /srv/dex/web/robots.txt
