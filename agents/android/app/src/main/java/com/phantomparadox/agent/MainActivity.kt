package com.phantomparadox.agent

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    
    private var permissionsGranted = mutableStateOf(false)
    private var showPermissionScreen = mutableStateOf(true)
    
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        checkAllPermissions()
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Check if permissions already granted
        checkAllPermissions()
        
        setContent {
            PhantomAgentTheme {
                if (showPermissionScreen.value && !permissionsGranted.value) {
                    PermissionsScreen(
                        onRequestPermissions = { requestRequiredPermissions() },
                        onSkip = { showPermissionScreen.value = false }
                    )
                } else {
                    AgentScreen()
                }
            }
        }
    }
    
    private fun checkAllPermissions() {
        val notificationGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true // Not needed on older Android
        }
        
        permissionsGranted.value = notificationGranted
        
        // If all permissions granted, skip the permission screen
        if (permissionsGranted.value) {
            showPermissionScreen.value = false
        }
    }
    
    private fun requestRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            permissionsGranted.value = true
            showPermissionScreen.value = false
        }
    }
}

@Composable
fun PermissionsScreen(
    onRequestPermissions: () -> Unit,
    onSkip: () -> Unit
) {
    val scrollState = rememberScrollState()
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF030508))
            .padding(24.dp)
            .verticalScroll(scrollState),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(32.dp))
        
        // Header
        Text(
            text = "🛡️",
            fontSize = 48.sp
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "Permissions Required",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF00FF88)
        )
        
        Text(
            text = "To earn PDOX, Phantom Agent needs these permissions",
            fontSize = 14.sp,
            color = Color(0xFF6B7C8A),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp, bottom = 24.dp)
        )
        
        // Permission Cards
        PermissionCard(
            icon = Icons.Default.Notifications,
            title = "Notifications",
            description = "Shows your earnings status while the agent runs in background. Required on Android 13+.",
            required = true,
            color = Color(0xFF00FF88)
        )
        
        PermissionCard(
            icon = Icons.Default.Star,
            title = "Network Access",
            description = "Connects to the Phantom network to relay traffic and earn rewards. This is how you get paid!",
            required = true,
            color = Color(0xFF00D4FF)
        )
        
        PermissionCard(
            icon = Icons.Default.Settings,
            title = "Background Running",
            description = "Keeps the agent running when your screen is off. Auto-pauses at 15% battery to protect your device.",
            required = true,
            color = Color(0xFFFF9500)
        )
        
        PermissionCard(
            icon = Icons.Default.Refresh,
            title = "Auto-Start (Optional)",
            description = "Automatically starts earning after your phone restarts. You can disable this in settings.",
            required = false,
            color = Color(0xFFA855F7)
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // What we DON'T access
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = Color(0xFF0A0F14)
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "🔒 What We DON'T Access",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF00FF88)
                )
                Spacer(modifier = Modifier.height(12.dp))
                
                NoAccessItem("Your personal files or photos")
                NoAccessItem("Your messages or contacts")
                NoAccessItem("Your location or GPS")
                NoAccessItem("Your camera or microphone")
                NoAccessItem("Any data on your device")
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Text(
                    text = "We only relay encrypted network traffic. We can't see what's inside.",
                    fontSize = 11.sp,
                    color = Color(0xFF6B7C8A)
                )
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Action Buttons
        Button(
            onClick = onRequestPermissions,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF00FF88)
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text(
                text = "GRANT PERMISSIONS & START",
                fontWeight = FontWeight.Bold,
                color = Color.Black
            )
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        TextButton(onClick = onSkip) {
            Text(
                text = "Skip for now (limited functionality)",
                color = Color(0xFF6B7C8A),
                fontSize = 12.sp
            )
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "You can change permissions anytime in Settings",
            fontSize = 11.sp,
            color = Color(0xFF3A4A5A),
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
fun PermissionCard(
    icon: ImageVector,
    title: String,
    description: String,
    required: Boolean,
    color: Color
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF0A0F14)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Icon
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(24.dp)
                )
            }
            
            Spacer(modifier = Modifier.width(14.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = title,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFFE8F0F8)
                    )
                    
                    Spacer(modifier = Modifier.width(8.dp))
                    
                    Text(
                        text = if (required) "Required" else "Optional",
                        fontSize = 10.sp,
                        color = if (required) color else Color(0xFF6B7C8A),
                        modifier = Modifier
                            .border(
                                width = 1.dp,
                                color = if (required) color.copy(alpha = 0.5f) else Color(0xFF3A4A5A),
                                shape = RoundedCornerShape(4.dp)
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                
                Text(
                    text = description,
                    fontSize = 12.sp,
                    color = Color(0xFF6B7C8A),
                    lineHeight = 18.sp
                )
            }
        }
    }
}

@Composable
fun NoAccessItem(text: String) {
    Row(
        modifier = Modifier.padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "✗",
            color = Color(0xFFFF4757),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = text,
            fontSize = 12.sp,
            color = Color(0xFF6B7C8A)
        )
    }
}

@Composable
fun PhantomAgentTheme(content: @Composable () -> Unit) {
    val colorScheme = darkColorScheme(
        primary = Color(0xFF00FF88),
        secondary = Color(0xFF00D4FF),
        background = Color(0xFF030508),
        surface = Color(0xFF0A0F14),
        onPrimary = Color.Black,
        onSecondary = Color.Black,
        onBackground = Color(0xFFE8F0F8),
        onSurface = Color(0xFFE8F0F8)
    )
    
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}

@Composable
fun AgentScreen(viewModel: AgentViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Header
        Text(
            text = "phantom_paradox",
            color = MaterialTheme.colorScheme.primary,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(vertical = 16.dp)
        )
        
        // Status Indicator
        Box(
            modifier = Modifier
                .size(120.dp)
                .clip(CircleShape)
                .background(
                    if (state.isRunning) 
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                    else 
                        Color(0xFF1A2530)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = if (state.isRunning) "●" else "○",
                fontSize = 48.sp,
                color = if (state.isRunning) 
                    MaterialTheme.colorScheme.primary 
                else 
                    Color(0xFF6B7C8A)
            )
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = if (state.isRunning) "ONLINE" else "OFFLINE",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )
        
        Text(
            text = if (state.isRunning) "Relaying traffic..." else "Tap to start earning",
            fontSize = 14.sp,
            color = Color(0xFF6B7C8A)
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Earnings Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "$${String.format("%.4f", state.earnings)}",
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = "Session Earnings",
                    fontSize = 12.sp,
                    color = Color(0xFF6B7C8A)
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Stats Grid
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatCard("Data", "${state.dataRelayedMb} MB", Modifier.weight(1f))
            StatCard("Uptime", formatUptime(state.uptimeSeconds), Modifier.weight(1f))
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatCard("Battery", "${state.batteryLevel}%", Modifier.weight(1f))
            StatCard("Rate", "$${String.format("%.2f", state.hourlyRate)}/hr", Modifier.weight(1f))
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Battery Warning
        if (state.batteryLevel < 20 && state.isRunning) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Color(0xFFFF9500).copy(alpha = 0.2f)
                )
            ) {
                Text(
                    text = "⚠️ Low battery - Agent will pause at 15%",
                    modifier = Modifier.padding(12.dp),
                    color = Color(0xFFFF9500),
                    fontSize = 12.sp
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
        
        // Main Button
        Button(
            onClick = { viewModel.toggleAgent() },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (state.isRunning) 
                    Color(0xFFFF4757) 
                else 
                    MaterialTheme.colorScheme.primary
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text(
                text = if (state.isRunning) "STOP" else "START EARNING",
                fontWeight = FontWeight.Bold
            )
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Settings Button
        OutlinedButton(
            onClick = { /* TODO: Open settings */ },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Settings")
        }
    }
}

@Composable
fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = value,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                text = label,
                fontSize = 10.sp,
                color = Color(0xFF6B7C8A)
            )
        }
    }
}

fun formatUptime(seconds: Long): String {
    val hours = seconds / 3600
    val mins = (seconds % 3600) / 60
    return "$hours:${mins.toString().padStart(2, '0')}"
}
