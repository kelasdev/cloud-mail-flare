<script lang="ts">
  export let name: string;
  export let size = 20;
</script>

<span class="material-symbols-outlined" style={`font-size:${size}px`} aria-hidden="true">{name}</span>
