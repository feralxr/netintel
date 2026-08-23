declare module "asciichart" {
  export interface PlotConfig {
    height?: number;
    colors?: (string | null)[];
    format?: (x: number, i: number) => string;
    min?: number;
    max?: number;
  }
  export function plot(series: number[] | number[][], config?: PlotConfig): string;
  export const black: string;
  export const red: string;
  export const green: string;
  export const yellow: string;
  export const blue: string;
  export const magenta: string;
  export const cyan: string;
  export const lightgray: string;
  export const darkgray: string;
  export const lightred: string;
  export const lightgreen: string;
  export const lightyellow: string;
  export const lightblue: string;
  export const lightmagenta: string;
  export const lightcyan: string;
  export const white: string;
  export const reset: string;
  export const colored: string;
  export const default_: string;
}
