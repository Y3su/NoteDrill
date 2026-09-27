$ErrorActionPreference = 'Stop'
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NoteDrillVulkan {
  [DllImport("vulkan-1.dll", CallingConvention = CallingConvention.Winapi)]
  public static extern int vkEnumerateInstanceVersion(out uint version);
}
'@
  [uint32]$version = 0
  $result = [NoteDrillVulkan]::vkEnumerateInstanceVersion([ref]$version)
  if ($result -ne 0) { throw "Vulkan returned $result" }
  $major = ($version -shr 22) -band 127
  $minor = ($version -shr 12) -band 1023
  $patch = $version -band 4095
  Write-Output "$major.$minor.$patch"
} catch {
  Write-Error 'Vulkan loader could not be queried. Install an up-to-date GPU vendor driver with Vulkan 1.4+.'
  exit 1
}
