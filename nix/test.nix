{ pkgs, module, package }:

pkgs.testers.runNixOSTest {
  name = "lirna";

  nodes.machine = { ... }: {
    imports = [ module ];
    services.lirna = {
      enable = true;
      inherit package;
      environmentFile = "/run/secrets/lirna.env";
      database.environmentFile = "/run/secrets/lirna-database.env";
    };
    systemd.tmpfiles.rules = [
      "d /run/secrets 0700 root root -"
      "f /run/secrets/lirna.env 0600 root root - HUMAN_ACCESS_TOKEN=synthetic-human-access-token-for-nixos-test\\nSERVICE_ACCESS_TOKEN=synthetic-service-access-token-for-nixos-test"
      "f /run/secrets/lirna-database.env 0600 root root - DATABASE_URL=postgresql:///lirna?host=/run/postgresql"
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
    # Rotating a secret file into an alias of the other must block the services
    # that would otherwise load the aliased tokens, even after first boot.
    machine.succeed("rm /run/secrets/lirna-database.env && ln -s lirna.env /run/secrets/lirna-database.env")
    machine.fail("systemctl restart lirna-secret-files.service")
    machine.succeed("journalctl -u lirna-secret-files.service | grep -q 'must resolve to separate files'")
    machine.fail("systemctl restart lirna-api.service")
    machine.fail("systemctl is-active lirna-api.service")
    machine.fail("systemctl restart lirna-worker.service")
    machine.fail("systemctl is-active lirna-worker.service")
  '';
}
