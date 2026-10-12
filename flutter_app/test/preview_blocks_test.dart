import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/preview_blocks.dart';

void main() {
  test('splits mermaid fence', () {
    const src = 'hello\n\n```mermaid\ngraph LR\n  A-->B\n```\n\nend';
    final blocks = splitPreviewBlocks(src);
    expect(blocks.any((b) => b.kind == PreviewBlockKind.mermaid), isTrue);
    expect(blocks.any((b) => b.kind == PreviewBlockKind.markdown && b.text.contains('hello')), isTrue);
  });

  test('splits display math', () {
    const src = '前\n\n\$\$E=mc^2\$\$\n\n后';
    final blocks = splitPreviewBlocks(src);
    final math = blocks.where((b) => b.kind == PreviewBlockKind.math).toList();
    expect(math.length, 1);
    expect(math.first.text, 'E=mc^2');
    expect(math.first.displayMath, isTrue);
  });

  test('splits inline math', () {
    const src = '能量 \$E=mc^2\$ 公式';
    final blocks = splitPreviewBlocks(src);
    expect(blocks.any((b) => b.kind == PreviewBlockKind.math && b.text == 'E=mc^2'), isTrue);
  });
}
