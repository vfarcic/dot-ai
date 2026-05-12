FROM ghcr.io/dexidp/dex:v2.44.0@sha256:5d0656fce7d453c0e3b2706abf40c0d0ce5b371fb0b73b3cf714d05f35fa5f86

LABEL org.opencontainers.image.source="https://github.com/vfarcic/dot-ai"
LABEL org.opencontainers.image.description="Dex OIDC provider with DevOps AI Toolkit branding"

COPY templates/ /srv/dex/web/templates/
COPY static/    /srv/dex/web/static/
COPY robots.txt /srv/dex/web/robots.txt
