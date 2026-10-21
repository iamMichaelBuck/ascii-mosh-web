<script lang="ts" generics="T extends string">
  let { label, value = $bindable(), items }: { label: string; value: T; items: readonly { id: T; title: string }[] } = $props();
</script>

<label class="picker">
  <span class="caption">{label}</span>
  <select bind:value>
    {#each items as item (item.id)}
      <option value={item.id}>{item.title}</option>
    {/each}
  </select>
</label>

<style>
  .picker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  select {
    max-width: 68%;
    height: 22px;
    padding: 0 22px 0 8px;
    border: 0;
    border-radius: calc(5px * var(--round));
    background: var(--control)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='10' viewBox='0 0 8 10'%3E%3Cpath d='M1 3.5 4 1l3 2.5M1 6.5 4 9l3-2.5' fill='none' stroke='%23888' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
      no-repeat right 7px center;
    box-shadow: var(--shadow);
    font-size: 12px;
    appearance: none;
    cursor: pointer;
    text-overflow: ellipsis;
  }
  @media (pointer: coarse) {
    select {
      height: 34px;
      font-size: 14px;
    }
  }
</style>
