<script lang="ts">
  export let bodyHtml = '';
  export let bodyText = '';
  export let snippet = '';

  $: hasHtml = bodyHtml.trim().length > 0;
  $: plainText = (bodyText || snippet || '(No Content)').trim();
  $: frameSrcDoc = buildFrameSrcDoc(bodyHtml);

  function buildFrameSrcDoc(rawHtml: string): string {
    const html = rawHtml.trim();
    if (!html) {
      return '';
    }

    if (/<html[\s>]/i.test(html)) {
      return html;
    }

    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`;
  }
</script>

{#if hasHtml}
  <iframe
    title="Email HTML Preview"
    class="email-frame"
    sandbox=""
    loading="lazy"
    referrerpolicy="no-referrer"
    srcdoc={frameSrcDoc}
  ></iframe>
{:else}
  <pre>{plainText}</pre>
{/if}

<style>
  .email-frame {
    width: 100%;
    min-height: 68vh;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 65%);
    border-radius: var(--radius-md);
    background: white;
  }

  pre {
    white-space: pre-wrap;
    line-height: 1.6;
    margin: 0;
    border: 1px solid color-mix(in srgb, var(--color-outline), transparent 65%);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    background: color-mix(in srgb, var(--color-primary-500), white 97%);
  }
</style>
