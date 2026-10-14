import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/sync/sync_http.dart';
import 'package:jingjian/services/sync/sync_oss.dart';

void main() {
  test('sync errors explain the status in Chinese', () {
    expect(syncHttpError('WebDAV', 404), contains('找不到同步目录'));
    expect(syncHttpError('OSS', 404), contains('Bucket'));
    expect(syncHttpError('同步服务器', 404), contains('重新部署'));
    expect(syncHttpError('WebDAV', 401), contains('密码'));
    expect(syncHttpError('OSS', 502), contains('服务器内部错误'));
  });
  test('ListObjectsV2 pagination parsing', () {
    const page1 = '<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>n/a&amp;b.md</Key></Contents>'
        '<NextContinuationToken>tok+/=</NextContinuationToken></ListBucketResult>';
    final r = parseListObjectsV2(page1);
    expect(r.keys, ['n/a&b.md']);
    expect(r.nextToken, 'tok+/=');
    expect(parseListObjectsV2('<IsTruncated>false</IsTruncated><Key>x.md</Key>').nextToken, isNull);
  });
}
