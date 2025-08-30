describe('Simple Test', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should test JSON stringify/parse', () => {
    const obj = { test: 'value', array: [1, 2, 3] };
    const json = JSON.stringify(obj);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(obj);
  });
});