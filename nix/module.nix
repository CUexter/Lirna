{ defaultPackage }:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.lirna;
  localDatabaseUrl = "postgresql:///lirna?host=/run/postgresql";
in
{
  options.services.lirna = {
    enable = lib.mkEnableOption "Lirna server";

    package = lib.mkPackageOption pkgs "lirna" { default = defaultPackage; };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port on which the Lirna server listens.";
    };

    openFirewall = lib.mkEnableOption "the Lirna server port in the firewall";

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "/run/secrets/lirna.env";
      description = ''
        Root-readable environment file containing BETTER_AUTH_SECRET,
        BETTER_AUTH_URL, and CORS_ORIGIN. It must also contain DATABASE_URL
        when services.lirna.database.createLocally is disabled.
      '';
    };

    database.createLocally = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to create a local PostgreSQL database using peer authentication.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [{
      assertion = cfg.environmentFile != null;
      message = "services.lirna.environmentFile is required";
    }];

    users.users.lirna = {
      isSystemUser = true;
      group = "lirna";
      home = "/var/lib/lirna";
    };
    users.groups.lirna = { };

    services.postgresql = lib.mkIf cfg.database.createLocally {
      enable = true;
      package = pkgs.postgresql_16;
      ensureDatabases = [ "lirna" ];
      ensureUsers = [{
        name = "lirna";
        ensureDBOwnership = true;
      }];
    };

    systemd.services.lirna = {
      description = "Lirna server";
      wantedBy = [ "multi-user.target" ];
      after = lib.optional cfg.database.createLocally "postgresql.service"
        ++ lib.optional (!cfg.database.createLocally) "network-online.target";
      requires = lib.optional cfg.database.createLocally "postgresql.service";
      wants = lib.optional (!cfg.database.createLocally) "network-online.target";
      environment = {
        NODE_ENV = "production";
        PORT = toString cfg.port;
      } // lib.optionalAttrs cfg.database.createLocally {
        DATABASE_URL = localDatabaseUrl;
      };
      serviceConfig = {
        User = "lirna";
        Group = "lirna";
        StateDirectory = "lirna";
        WorkingDirectory = "/var/lib/lirna";
        ExecStart = lib.getExe cfg.package;
        EnvironmentFile = cfg.environmentFile;
        Restart = "on-failure";
        RestartSec = 5;
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectHome = true;
        ProtectSystem = "strict";
      };
    };

    networking.firewall.allowedTCPPorts = lib.optional cfg.openFirewall cfg.port;
  };
}
