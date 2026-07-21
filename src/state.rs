use kryx::domain::identity::HostIdentity;

#[derive(Debug, Clone)]
pub enum RuntimeMode {
    LiveInstaller,
    InstalledHost(HostIdentity),
}
