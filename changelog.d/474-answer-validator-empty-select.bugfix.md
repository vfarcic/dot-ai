### Answer validator now accepts empty string when it's an explicit `select` option

When the recommend tool generated a required `select` question whose `options` list explicitly included `""` (e.g., `["", "soft", "hard"]` to mean "no anti-affinity"), the answer validator rejected the empty string with a "required" error even though the question itself listed it as a valid choice. The validator now treats `""` as a valid answer for required `select` questions whenever it appears in the question's `options` array.
