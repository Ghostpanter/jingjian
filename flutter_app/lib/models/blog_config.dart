enum BlogEngine { hugo, hexo }
enum BlogHost { github, gitee }

class BlogConfig {
  BlogConfig({
    this.token = '',
    this.repo = '',
    this.branch = 'main',
    this.engine = BlogEngine.hugo,
    this.postsDir = 'content/posts',
    this.host = BlogHost.github,
    this.extraFrontMatter = '',
  });

  String token;
  String repo;
  String branch;
  BlogEngine engine;
  String postsDir;
  BlogHost host;
  String extraFrontMatter;

  bool get isConfigured => token.trim().isNotEmpty && repo.trim().contains('/');

  Map<String, dynamic> toJson() => {
        'token': token,
        'repo': repo,
        'branch': branch,
        'engine': engine.name,
        'postsDir': postsDir,
        'host': host.name,
        'extraFrontMatter': extraFrontMatter,
      };

  factory BlogConfig.fromJson(Map<String, dynamic> json) {
    BlogEngine engine = BlogEngine.hugo;
    for (final e in BlogEngine.values) {
      if (e.name == json['engine']) engine = e;
    }
    BlogHost host = BlogHost.github;
    for (final h in BlogHost.values) {
      if (h.name == json['host']) host = h;
    }
    final postsDir = json['postsDir'] as String? ??
        (engine == BlogEngine.hugo ? 'content/posts' : 'source/_posts');
    return BlogConfig(
      token: json['token'] as String? ?? '',
      repo: json['repo'] as String? ?? '',
      branch: (json['branch'] as String?)?.isNotEmpty == true ? json['branch'] as String : 'main',
      engine: engine,
      postsDir: postsDir,
      host: host,
      extraFrontMatter: json['extraFrontMatter'] as String? ?? '',
    );
  }

  BlogConfig copy() => BlogConfig.fromJson(toJson());
}
