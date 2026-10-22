export const DangerousHtml = ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />;
