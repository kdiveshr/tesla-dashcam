import { TeslaTelemetrySample } from './tesla-telemetry.interface';

/** A source-specific decoder. Add one parser per supported telemetry format. */
export interface TelemetryParser {
  canParse(file: File): boolean;
  parse(file: File): Promise<TeslaTelemetrySample[]>;
}
