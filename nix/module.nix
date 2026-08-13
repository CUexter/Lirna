{ defaultPackage }:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.lirna;
  localDatabaseUrl = "postgresql:///lirna?host=/run/postgresql";
  commonEnvironment = {
    ARTIFACT_ROOT = cfg.artifactRoot;
    SYNTHETIC_RESULT_ROOT = cfg.syntheticResultRoot;
  };
  apiEnvironmentFiles =
    lib.optional (cfg.environmentFile != null) cfg.environmentFile
    ++ lib.optional (cfg.database.environmentFile != null) cfg.database.environmentFile;
  databaseEnvironmentFiles = lib.optional
    (cfg.database.environmentFile != null)
    cfg.database.environmentFile;
  databaseEnvironment = lib.optionalAttrs cfg.database.createLocally {
    DATABASE_URL = localDatabaseUrl;
  };
  # The pair of root-managed secret files. Naming the pair lets the separation
  # rules (both-present, must-differ, runtime-alias check) be expressed once
  # against it instead of re-deriving the relationship at each site.
  secretFiles = {
    access = cfg.environmentFile;
    database = cfg.database.environmentFile;
  };
  # Both files being configured is the only case where they could collide, so it
  # gates the runtime separation check and every service that depends on it.
  haveBothSecretFiles = secretFiles.access != null && secretFiles.database != null;
  secretFilesAreDistinct = !haveBothSecretFiles || secretFiles.access != secretFiles.database;
  secretFilesDependency = lib.optional haveBothSecretFiles "lirna-secret-files.service";
  validateSecretFiles =
    if haveBothSecretFiles then
      pkgs.writeShellScript "lirna-validate-secret-files" ''
        set -eu
        access_file=$(${pkgs.coreutils}/bin/readlink -e -- ${lib.escapeShellArg secretFiles.access})
        database_file=$(${pkgs.coreutils}/bin/readlink -e -- ${lib.escapeShellArg secretFiles.database})
        if [ "$access_file" = "$database_file" ]; then
          echo "Lirna access-token and database environment files must resolve to separate files" >&2
          exit 1
        fi
      ''
    else
      null;
in
{
  options.services.lirna = {
    enable = lib.mkEnableOption "Lirna";

    package = lib.mkPackageOption pkgs "lirna" { default = defaultPackage; };
    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address on which the API listens.";
    };
    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port on which the API listens.";
    };
    openFirewall = lib.mkEnableOption "the Lirna API port in the firewall";
    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "/run/secrets/lirna.env";
      description = "Root-readable environment file containing HUMAN_ACCESS_TOKEN and SERVICE_ACCESS_TOKEN.";
    };
    enableApi = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to run the API and PWA service.";
    };
    enableWorker = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to run the background worker.";
    };
    artifactRoot = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/lirna/artifacts";
      description = "Directory for stored artifacts.";
    };
    syntheticResultRoot = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/lirna/synthetic-results";
      description = "Directory for synthetic operation results.";
    };
    database = {
      createLocally = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether to create a local PostgreSQL database using peer authentication.";
      };
      environmentFile = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "/run/secrets/lirna-database.env";
        description = "Root-readable environment file containing DATABASE_URL when createLocally is false.";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = !cfg.enableApi || cfg.environmentFile != null;
        message = "services.lirna.environmentFile is required when the API is enabled";
      }
      {
        assertion = cfg.database.createLocally || cfg.database.environmentFile != null;
        message = "services.lirna.database.environmentFile is required when createLocally is false";
      }
      {
        assertion = secretFilesAreDistinct;
        message = "services.lirna.environmentFile and services.lirna.database.environmentFile must be separate files";
      }
    ];

    users.users.lirna = {
      isSystemUser = true;
      group = "lirna";
      home = "/var/lib/lirna";
    };
    users.groups.lirna = { };

    systemd.tmpfiles.rules = [
      "d ${cfg.artifactRoot} 0750 lirna lirna -"
      "d ${cfg.syntheticResultRoot} 0750 lirna lirna -"
    ];

    services.postgresql = lib.mkIf cfg.database.createLocally {
      enable = true;
      package = pkgs.postgresql_16;
      ensureDatabases = [ "lirna" ];
      ensureUsers = [{
        name = "lirna";
        ensureDBOwnership = true;
      }];
    };

    # A oneshot that does not remain active, so every dependent (re)start
    # re-runs it: rotating a secret file into a symlink alias fails validation
    # and blocks the service that would otherwise load the aliased tokens.
    systemd.services.lirna-secret-files = lib.mkIf haveBothSecretFiles {
      description = "Validate separation of Lirna secret files";
      serviceConfig = {
        Type = "oneshot";
        ExecStart = validateSecretFiles;
      };
    };

    systemd.services.lirna-migrate = {
      description = "Apply committed Lirna database migrations";
      wantedBy = [ "multi-user.target" ];
      after =
        lib.optional cfg.database.createLocally "postgresql.service"
        ++ lib.optional (!cfg.database.createLocally) "network-online.target"
        ++ secretFilesDependency;
      requires =
        lib.optional cfg.database.createLocally "postgresql.service"
        ++ secretFilesDependency;
      wants = lib.optional (!cfg.database.createLocally) "network-online.target";
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        User = "lirna";
        Group = "lirna";
        StateDirectory = "lirna";
        WorkingDirectory = "/var/lib/lirna";
        ExecStart = "${cfg.package}/bin/lirna-migrate";
        EnvironmentFile = databaseEnvironmentFiles;
        Restart = "on-failure";
        RestartSec = 5;
      };
      environment = commonEnvironment // databaseEnvironment;
    };

    systemd.services.lirna-api = lib.mkIf cfg.enableApi {
      description = "Lirna API and PWA";
      wantedBy = [ "multi-user.target" ];
      after = [ "lirna-migrate.service" ] ++ secretFilesDependency;
      requires = [ "lirna-migrate.service" ] ++ secretFilesDependency;
      serviceConfig = {
        User = "lirna";
        Group = "lirna";
        StateDirectory = "lirna";
        WorkingDirectory = "/var/lib/lirna";
        ExecStart = "${cfg.package}/bin/lirna-api";
        Restart = "on-failure";
        EnvironmentFile = apiEnvironmentFiles;
      };
      environment = commonEnvironment // databaseEnvironment // {
        HOST = cfg.host;
        PORT = toString cfg.port;
      };
    };

    systemd.services.lirna-worker = lib.mkIf cfg.enableWorker {
      description = "Lirna background worker";
      wantedBy = [ "multi-user.target" ];
      after = [ "lirna-migrate.service" ] ++ secretFilesDependency;
      requires = [ "lirna-migrate.service" ] ++ secretFilesDependency;
      serviceConfig = {
        User = "lirna";
        Group = "lirna";
        StateDirectory = "lirna";
        WorkingDirectory = "/var/lib/lirna";
        ExecStart = "${cfg.package}/bin/lirna-worker";
        Restart = "on-failure";
        EnvironmentFile = databaseEnvironmentFiles;
      };
      environment = commonEnvironment // databaseEnvironment;
    };

    networking.firewall.allowedTCPPorts = lib.optional cfg.openFirewall cfg.port;
  };
}
