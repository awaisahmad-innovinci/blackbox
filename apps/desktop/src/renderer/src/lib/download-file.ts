export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
): Promise<void> {
  return new Promise((resolve) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    window.setTimeout(resolve, 150);
  });
}
