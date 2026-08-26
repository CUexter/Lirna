{ pkgs, module, package }:

pkgs.testers.runNixOSTest {
  name = "lirna";

  nodes.machine = { ... }: {
    imports = [ module ];
    services.lirna = {
      enable = true;
      inherit package;
      environmentFile = "/etc/lirna.env";
    };
    environment.etc."lirna.env" = {
      mode = "0600";
      text = ''
        CORS_ORIGIN=http://127.0.0.1:3001
      '';
    };
  };

  testScript = ''
    machine.start()
    machine.wait_for_unit("lirna.service")
    machine.wait_for_open_port(3000)
    machine.succeed("curl --fail http://127.0.0.1:3000/ | grep -qx OK")
  '';
}
