export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
): Promise<void> {
  return new Promise((resolve) => {
    // BOM so Excel opens UTF-8 (Urdu names) correctly.
    const body = mime.startsWith("text/csv") ? `\uFEFF${content}` : content;
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoke later: Safari/Firefox may still be reading the blob right after click().
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve();
    }, 1000);
  });
}
