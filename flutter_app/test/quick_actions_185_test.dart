import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/quick_actions.dart';

void main() {
  test('defaults include requested shortcuts', () {
    expect(QuickActions.defaults, containsAll(['tts', 'search', 'pane', 'star', 'export', 'folder', 'trash']));
    expect(QuickActions.defaults.every((d) => QuickActions.byId(d) != null), isTrue);
  });
  test('sanitize drops unknown and duplicates', () {
    expect(QuickActions.sanitize(['star', 'nope', 'star', 'trash']), ['star', 'trash']);
  });
  test('fit reserves the overflow button', () {
    expect(QuickActions.fit(48.0 * 8, 7), 7);
    expect(QuickActions.fit(200, 7), 3);
    expect(QuickActions.fit(40, 7), 0);
  });
}
