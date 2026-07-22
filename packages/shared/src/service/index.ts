/**
 * Service contracts own use-case orchestration, transactions, domain errors
 * and structured logging. HTTP routes must not contain these responsibilities.
 */
export interface Service<Input, Output> {
  execute(input: Input): Promise<Output>;
}
