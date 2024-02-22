import 'dart:convert';

import 'package:archive/archive_io.dart';
import 'package:mime/mime.dart';
import 'package:ndk/ndk.dart';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_cors_headers/shelf_cors_headers.dart';
import 'package:shelf_router/shelf_router.dart';
import 'package:shelf_static/shelf_static.dart';
import 'package:http/http.dart' as http;
import 'package:crypto/crypto.dart';

void main() async {
  final router = Router();
  final notifier = FrameNotifier();
  await notifier.initialize('wss://relay.damus.io');

  router.post('/publish', (Request request) async {
    final body = await request.readAsString();
    final map = jsonDecode(body) as Map<String, dynamic>;

    final fm = Event.fromMap(Map<String, dynamic>.from(map['artifact'] as Map));
    final release =
        Event.fromMap(Map<String, dynamic>.from(map['release'] as Map));
    await notifier.publish(fm);
    await notifier.publish(release);

    return Response.ok('Published');
  });

  router.get('/artifact/<url>', (Request request, String url) async {
    final decodedUrl = Uri.decodeComponent(url);
    final response = await http.get(Uri.parse(decodedUrl));

    final bytes = response.bodyBytes;
    final digest = sha256.convert(bytes);

    final mtr = MimeTypeResolver()
      ..addExtension('apk', 'application/vnd.android.package-archive')
      ..addMagicNumber(
          [0x4D, 0x5A, 0x90, 0x00], 'application/vnd.android.package-archive')
      ..addMagicNumber(
          [0x50, 0x4B, 0x03, 0x04], 'application/vnd.android.package-archive');

    final archs = <String>{};

    final mimeType = mtr.lookup(url, headerBytes: bytes);
    if (mimeType == 'application/vnd.android.package-archive') {
      final archive = ZipDecoder().decodeBytes(bytes);
      archs.addAll(
          archive.files.where((a) => a.name.startsWith('lib/')).map((e) {
        final [_, arch, ..._] = e.name.split('/');
        return arch;
      }));
    }

    return Response.ok(
        jsonEncode({
          'tags': [
            ["url", decodedUrl],
            ["x", digest.toString()],
            ["m", mimeType],
            ["size", bytes.lengthInBytes.toString()],
            for (final arch in archs) ["arch", arch]
          ]
        }),
        headers: {'Content-Type': 'application/json'});
  });

  router.mount(
      '/', createStaticHandler('web/dist/', defaultDocument: 'index.html'));

  final cors = corsHeaders();

  final handler = const Pipeline()
      .addMiddleware(cors)
      .addMiddleware(logRequests())
      .addHandler(router);

  var server = await shelf_io.serve(handler, 'localhost', 1063);

  // Enable content compression
  server.autoCompress = true;

  print('Serving at http://${server.address.host}:${server.port}');
}
