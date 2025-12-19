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
Validate Gateway API configuration
*/}}
{{- define "dot-ai.validateGateway" -}}
{{- if and .Values.gateway.create (not .Values.gateway.name) }}
{{- if not .Values.gateway.className }}
{{- fail "gateway.className is required when gateway.create is true" }}
{{- end }}
{{- else if and .Values.gateway.name .Values.gateway.create }}
{{- fail "Cannot set both gateway.name (reference mode) and gateway.create (creation mode). Choose one approach." }}
{{- else if and (not .Values.gateway.name) (not .Values.gateway.create) }}
{{- if or .Values.gateway.className .Values.gateway.listeners.http.enabled .Values.gateway.listeners.https.enabled }}
{{- fail "gateway.name is required when using Gateway API in reference mode. Set gateway.name to reference an existing Gateway, or set gateway.create=true to create a new Gateway." }}
{{- end }}
{{- end }}
{{- end }}