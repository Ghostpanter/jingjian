import {
  Bold,
  Heading2,
  ImagePlus,
  Link2,
  List,
  Table,
} from "lucide-react";
import {
  insertTable,
  setHeading,
  toggleUnorderedList,
  wrapInline,
} from "@/lib/notes/insert-markup";

type FormatBarProps = {
  disabled?: boolean;
  onApply: (
    mutator: (value: string, start: number, end: number) => { value: string; start: number; end: number },
  ) => void;
  onLink: () => void;
  onImage: () => void;
};

export function FormatBar({ disabled, onApply, onLink, onImage }: FormatBarProps) {
  return (
    <div className="format-bar md:hidden" role="toolbar" aria-label="排版">
      <button type="button" disabled={disabled} aria-label="加粗" onClick={() => onApply((v, s, e) => wrapInline(v, s, e, "**"))}>
        <Bold />
      </button>
      <button type="button" disabled={disabled} aria-label="标题" onClick={() => onApply((v, s, e) => setHeading(v, s, e, 2))}>
        <Heading2 />
      </button>
      <button type="button" disabled={disabled} aria-label="列表" onClick={() => onApply((v, s, e) => toggleUnorderedList(v, s, e))}>
        <List />
      </button>
      <button type="button" disabled={disabled} aria-label="链接" onClick={onLink}>
        <Link2 />
      </button>
      <button type="button" disabled={disabled} aria-label="图片" onClick={onImage}>
        <ImagePlus />
      </button>
      <button type="button" disabled={disabled} aria-label="表格" onClick={() => onApply((v, s, e) => insertTable(v, s, e))}>
        <Table />
      </button>
    </div>
  );
}
