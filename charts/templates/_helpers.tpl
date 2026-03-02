{{/*
Expand the name of the chart.
*/}}
{{- define "dot-ai.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "dot-ai.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "dot-ai.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "dot-ai.labels" -}}
helm.sh/chart: {{ include "dot-ai.chart" . }}
{{ include "dot-ai.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "dot-ai.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dot-ai.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "dot-ai.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "dot-ai.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Merge global annotations with resource-specific annotations.
Resource-specific annotations take precedence over global annotations.
Usage: include "dot-ai.annotations" (dict "global" .Values.annotations "local" .Values.ingress.annotations)
*/}}
{{- define "dot-ai.annotations" -}}
{{- $global := .global | default dict -}}
{{- $local := .local | default dict -}}
{{- $merged := merge (deepCopy $local) $global -}}
{{- if $merged -}}
{{- toYaml $merged -}}
{{- end -}}
{{- end -}}

{{/*
Build DOT_AI_PLUGINS_CONFIG JSON from enabled plugins.
Supports two modes:
  - Deployed: image + port → auto-generates endpoint URL
  - External: endpoint → uses provided URL
*/}}
{{/*
Dex external host — derived from the main ingress/gateway host.
Prepends "dex." to the main host (e.g., dot-ai.example.com → dex.dot-ai.example.com).
*/}}
{{- define "dot-ai.dexExternalHost" -}}
{{- $host := "" -}}
{{- if .Values.ingress.enabled -}}
  {{- $host = .Values.ingress.host -}}
{{- else if .Values.gateway.listeners.http.hostname -}}
  {{- $host = .Values.gateway.listeners.http.hostname -}}
{{- else if .Values.gateway.listeners.https.hostname -}}
  {{- $host = .Values.gateway.listeners.https.hostname -}}
{{- end -}}
{{- if $host -}}
dex.{{ $host }}
{{- end -}}
{{- end -}}

{{/*
Dex external URL — full URL including scheme and optional port.
Used as the Dex issuer URL and for browser redirects.
*/}}
{{- define "dot-ai.dexExternalUrl" -}}
{{- if .Values.dex.externalUrl -}}
{{ .Values.dex.externalUrl }}
{{- else -}}
{{- $host := include "dot-ai.dexExternalHost" . -}}
{{- if $host -}}
{{- if .Values.ingress.tls.enabled -}}
https://{{ $host }}
{{- else -}}
http://{{ $host }}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
dot-ai external URL — full URL of the main MCP server.
Used for OAuth callback redirect URI.
*/}}
{{- define "dot-ai.externalUrl" -}}
{{- if .Values.externalUrl -}}
{{ .Values.externalUrl }}
{{- else if .Values.ingress.enabled -}}
  {{- if .Values.ingress.tls.enabled -}}
https://{{ .Values.ingress.host }}
  {{- else -}}
http://{{ .Values.ingress.host }}
  {{- end -}}
{{- else if .Values.gateway.listeners.https.hostname -}}
https://{{ .Values.gateway.listeners.https.hostname }}
{{- else if .Values.gateway.listeners.http.hostname -}}
http://{{ .Values.gateway.listeners.http.hostname }}
{{- end -}}
{{- end -}}

{{/*
Dex in-cluster token endpoint — for server-to-server token exchange.
The MCP server pod uses this URL (not the external one) to talk to Dex.
*/}}
{{- define "dot-ai.dexTokenEndpoint" -}}
http://{{ .Release.Name }}-dex.{{ .Release.Namespace }}.svc.cluster.local:5556/token
{{- end -}}

{{- define "dot-ai.pluginsConfig" -}}
{{- $plugins := list -}}
{{- range $name, $config := .Values.plugins -}}
{{- if $config.enabled -}}
{{- $endpoint := "" -}}
{{- if $config.endpoint -}}
{{- $endpoint = $config.endpoint -}}
{{- else if $config.image -}}
{{- $port := required (printf "plugins.%s.port is required when image is set" $name) $config.port -}}
{{- $endpoint = printf "http://%s-%s:%d" $.Release.Name $name (int $port) -}}
{{- else -}}
{{- fail (printf "plugins.%s is enabled but has neither endpoint nor image configured" $name) -}}
{{- end -}}
{{- if $endpoint -}}
{{- $plugins = append $plugins (dict "name" $name "url" $endpoint) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- $plugins | toJson -}}
{{- end -}}