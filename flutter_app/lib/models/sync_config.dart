enum SyncProvider { off, server, webdav, folder, oss }

enum OssVendor { aliyun, tencent, huawei, qiniu, volcengine, aws, minio }

class SyncConfig {
  SyncConfig({
    this.provider = SyncProvider.off,
    this.autoSync = true,
    this.serverUrl = 'http://127.0.0.1:8787',
    this.serverToken = '',
    this.webdavUrl = 'https://dav.jianguoyun.com/dav/',
    this.webdavUser = '',
    this.webdavPassword = '',
    this.webdavPath = '/静笺',
    this.folderPath = 'Jingjian',
    this.ossVendor = OssVendor.aliyun,
    this.ossEndpoint = 'oss-cn-hangzhou.aliyuncs.com',
    this.ossRegion = 'cn-hangzhou',
    this.ossBucket = '',
    this.ossAccessKey = '',
    this.ossSecretKey = '',
    this.ossPrefix = 'jingjian',
    this.ossPathStyle = false,
  });

  SyncProvider provider;
  bool autoSync;
  String serverUrl;
  String serverToken;
  String webdavUrl;
  String webdavUser;
  String webdavPassword;
  String webdavPath;
  String folderPath;
  OssVendor ossVendor;
  String ossEndpoint;
  String ossRegion;
  String ossBucket;
  String ossAccessKey;
  String ossSecretKey;
  String ossPrefix;
  bool ossPathStyle;

  Map<String, dynamic> toJson() => {
        'provider': provider.name,
        'autoSync': autoSync,
        'serverUrl': serverUrl,
        'serverToken': serverToken,
        'webdavUrl': webdavUrl,
        'webdavUser': webdavUser,
        'webdavPassword': webdavPassword,
        'webdavPath': webdavPath,
        'folderPath': folderPath,
        'ossVendor': ossVendor.name,
        'ossEndpoint': ossEndpoint,
        'ossRegion': ossRegion,
        'ossBucket': ossBucket,
        'ossAccessKey': ossAccessKey,
        'ossSecretKey': ossSecretKey,
        'ossPrefix': ossPrefix,
        'ossPathStyle': ossPathStyle,
      };

  factory SyncConfig.fromJson(Map<String, dynamic> json) {
    SyncProvider provider = SyncProvider.off;
    for (final p in SyncProvider.values) {
      if (p.name == json['provider']) provider = p;
    }
    OssVendor vendor = OssVendor.aliyun;
    for (final v in OssVendor.values) {
      if (v.name == json['ossVendor']) vendor = v;
    }
    return SyncConfig(
      provider: provider,
      autoSync: json['autoSync'] != false,
      serverUrl: json['serverUrl'] as String? ?? 'http://127.0.0.1:8787',
      serverToken: json['serverToken'] as String? ?? '',
      webdavUrl: json['webdavUrl'] as String? ?? 'https://dav.jianguoyun.com/dav/',
      webdavUser: json['webdavUser'] as String? ?? '',
      webdavPassword: json['webdavPassword'] as String? ?? '',
      webdavPath: json['webdavPath'] as String? ?? '/静笺',
      folderPath: json['folderPath'] as String? ?? 'Jingjian',
      ossVendor: vendor,
      ossEndpoint: json['ossEndpoint'] as String? ?? 'oss-cn-hangzhou.aliyuncs.com',
      ossRegion: json['ossRegion'] as String? ?? 'cn-hangzhou',
      ossBucket: json['ossBucket'] as String? ?? '',
      ossAccessKey: json['ossAccessKey'] as String? ?? '',
      ossSecretKey: json['ossSecretKey'] as String? ?? '',
      ossPrefix: json['ossPrefix'] as String? ?? 'jingjian',
      ossPathStyle: json['ossPathStyle'] == true,
    );
  }

  SyncConfig copy() => SyncConfig.fromJson(toJson());
}

class SyncStatus {
  SyncStatus({this.state = 'idle', this.message = '', this.at});
  String state; // idle | syncing | ok | error
  String message;
  int? at;
}
