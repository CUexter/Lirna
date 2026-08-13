{ pkgs, module, package }:

pkgs.testers.runNixOSTest {
  name = "lirna";

  nodes.machine = { ... }: {
    imports = [ module ];
    services.lirna = {
      enable = true;
      inherit package;
      environmentFile = "/run/secrets/lirna.env";
    };
    systemd.tmpfiles.rules = [
      "d /run/secrets 0700 root root -"
      "f /run/secrets/lirna.env 0600 root root - HUMAN_ACCESS_TOKEN=synthetic-human-access-token-for-nixos-test\\nSERVICE_ACCESS_TOKEN=synthetic-service-access-token-for-nixos-test"
    ];
  };

  testScript = ''
    machine.start()
    machine.wait_for_unit("lirna-migrate.service")
    machine.wait_for_unit("lirna-api.service")
    machine.wait_for_unit("lirna-worker.service")
    machine.wait_for_open_port(3000)
    machine.succeed("curl --fail http://127.0.0.1:3000/ | grep -q '<div id=\"root\"></div>'")
    machine.succeed("test -d /var/lib/lirna/artifacts")
  '';
}
