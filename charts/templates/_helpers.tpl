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
Get the backend service name based on deployment method
*/}}
{{- define "dot-ai.backendServiceName" -}}
{{- if eq .Values.deployment.method "toolhive" }}
{{- printf "mcp-%s-proxy" (include "dot-ai.fullname" .) }}
{{- else }}
{{- include "dot-ai.fullname" . }}
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
{{- end -}}
{{- if $endpoint -}}
{{- $plugins = append $plugins (dict "name" $name "url" $endpoint) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- $plugins | toJson -}}
{{- end -}}