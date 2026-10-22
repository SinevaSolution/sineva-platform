// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNField } from '../sn_field/sn_field';
import { SNDropzone } from './sn_dropzone';

afterEach(cleanup);

const messages = { type: 'Wrong type', size: 'Too big', count: 'Too many' };
const file = (name: string, size = 5, type = 'text/plain') =>
  new File(['x'.repeat(size)], name, { type });

function hiddenInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function drop(target: Element, files: File[]) {
  fireEvent.drop(target, { dataTransfer: { files, types: ['Files'] } });
}

describe('SNDropzone', () => {
  it('is a button named by its label that opens the hidden file input', () => {
    const { container } = render(
      <SNDropzone label="Drop a file" value={[]} onFilesChange={() => {}} messages={messages} />,
    );
    const input = hiddenInput(container);
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Drop a file' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(input.tabIndex).toBe(-1);
  });

  it('passes a chosen file to the caller and lists the controlled value', () => {
    const onFilesChange = vi.fn();
    const { container, rerender } = render(
      <SNDropzone label="Drop" value={[]} onFilesChange={onFilesChange} messages={messages} />,
    );
    const chosen = file('notes.txt');
    fireEvent.change(hiddenInput(container), { target: { files: [chosen] } });
    expect(onFilesChange).toHaveBeenCalledWith([chosen]);
    rerender(
      <SNDropzone label="Drop" value={[chosen]} onFilesChange={onFilesChange} messages={messages} />,
    );
    expect(screen.getByText('notes.txt')).toBeTruthy();
  });

  it('renders no file list when the caller omits value and shows the files itself', () => {
    render(<SNDropzone label="Drop" onFilesChange={() => {}} messages={messages} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('accepts dropped files and marks the zone while a file is dragged over it', () => {
    const onFilesChange = vi.fn();
    render(<SNDropzone label="Drop" value={[]} onFilesChange={onFilesChange} messages={messages} />);
    const button = screen.getByRole('button', { name: 'Drop' });
    fireEvent.dragEnter(button, { dataTransfer: { types: ['Files'] } });
    expect(button.className).toContain('border-focus');
    const dropped = file('a.txt');
    drop(button, [dropped]);
    expect(button.className).not.toContain('border-focus');
    expect(onFilesChange).toHaveBeenCalledWith([dropped]);
  });

  it('rejects a disallowed type with the caller message and links it to the button', () => {
    const onFilesChange = vi.fn();
    render(
      <SNDropzone
        label="Drop"
        value={[]}
        accept=".pdf,image/*"
        onFilesChange={onFilesChange}
        messages={messages}
      />,
    );
    const button = screen.getByRole('button', { name: 'Drop' });
    drop(button, [file('a.txt')]);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Wrong type');
    expect(button.getAttribute('aria-invalid')).toBe('true');
    expect(button.getAttribute('aria-describedby')).toContain(alert.id);
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it('matches extensions and wildcard MIME types case-insensitively', () => {
    const onFilesChange = vi.fn();
    render(
      <SNDropzone
        label="Drop"
        multiple
        value={[]}
        accept=".pdf,image/*"
        onFilesChange={onFilesChange}
        messages={messages}
      />,
    );
    const pdf = file('REPORT.PDF', 5, 'application/pdf');
    const png = file('scan', 5, 'image/png');
    drop(screen.getByRole('button'), [pdf, png]);
    expect(onFilesChange).toHaveBeenCalledWith([pdf, png]);
  });

  it('rejects empty files and files above maxBytes', () => {
    const onFilesChange = vi.fn();
    render(
      <SNDropzone
        label="Drop"
        value={[]}
        maxBytes={10}
        onFilesChange={onFilesChange}
        messages={messages}
      />,
    );
    drop(screen.getByRole('button'), [file('empty.txt', 0)]);
    expect(screen.getByRole('alert').textContent).toBe('Too big');
    drop(screen.getByRole('button'), [file('big.txt', 11)]);
    expect(screen.getByRole('alert').textContent).toBe('Too big');
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it('rejects several dropped files in single mode', () => {
    const onFilesChange = vi.fn();
    render(<SNDropzone label="Drop" value={[]} onFilesChange={onFilesChange} messages={messages} />);
    drop(screen.getByRole('button'), [file('a.txt'), file('b.txt')]);
    expect(screen.getByRole('alert').textContent).toBe('Too many');
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it('keeps the valid files of a multiple drop and reports the rejected ones', () => {
    const onFilesChange = vi.fn();
    render(
      <SNDropzone
        label="Drop"
        multiple
        accept=".txt"
        onFilesChange={onFilesChange}
        messages={{ type: 'Wrong type', size: 'Too big' }}
      />,
    );
    const good = file('a.txt');
    drop(screen.getByRole('button'), [good, file('b.exe')]);
    expect(onFilesChange).toHaveBeenCalledWith([good]);
    expect(screen.getByRole('alert').textContent).toBe('Wrong type');
  });

  it('enforces maxFiles in multiple mode', () => {
    const onFilesChange = vi.fn();
    render(
      <SNDropzone
        label="Drop"
        multiple
        maxFiles={2}
        onFilesChange={onFilesChange}
        messages={messages}
      />,
    );
    drop(screen.getByRole('button'), [file('a.txt'), file('b.txt'), file('c.txt')]);
    expect(screen.getByRole('alert').textContent).toBe('Too many');
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it('clears an earlier error after a valid selection', () => {
    render(
      <SNDropzone label="Drop" accept=".txt" onFilesChange={() => {}} messages={messages} />,
    );
    drop(screen.getByRole('button'), [file('a.exe')]);
    expect(screen.getByRole('alert')).toBeTruthy();
    drop(screen.getByRole('button'), [file('a.txt')]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores clicks and drops while disabled', () => {
    const onFilesChange = vi.fn();
    render(
      <SNDropzone label="Drop" disabled onFilesChange={onFilesChange} messages={messages} />,
    );
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    drop(button, [file('a.txt')]);
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it('takes its id and invalid state from SNField and describes itself with the hint', () => {
    render(
      <SNField label="File" error="Choose a file">
        <SNDropzone label="Drop" hint="Up to 25 MB" onFilesChange={() => {}} messages={messages} />
      </SNField>,
    );
    // The field label names the control, as it does for every SN input.
    const button = screen.getByRole('button', { name: 'File' });
    expect(button.getAttribute('aria-invalid')).toBe('true');
    const hint = screen.getByText('Up to 25 MB');
    expect(button.getAttribute('aria-describedby')).toContain(hint.id);
    expect(button.getAttribute('aria-describedby')).toContain(
      screen.getByText('Choose a file').id,
    );
  });
});
