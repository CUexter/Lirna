export function mutationOptions<TInput>(
  getAction: () => (input: TInput) => Promise<unknown>,
) {
  return { mutationFn: (input: TInput) => getAction()(input) };
}
