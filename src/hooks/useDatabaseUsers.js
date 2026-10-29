import { useCallback, useRef, useState } from 'react'
import { api } from '../api.js'

const EMPTY_DATABASE_USERS = { status: 'idle', users: [], roles: [], logins: [], error: null }

export function useDatabaseUsers({ activeSession, showBanner }) {
  const [databaseUsersOpen, setDatabaseUsersOpen] = useState(false)
  const [databaseUsers, setDatabaseUsers] = useState(EMPTY_DATABASE_USERS)
  const [databaseUsersBusy, setDatabaseUsersBusy] = useState(false)
  const databaseUsersRequestRef = useRef(0)

  const loadDatabaseUsers = useCallback(async (connectionId, database) => {
    const requestId = databaseUsersRequestRef.current + 1
    databaseUsersRequestRef.current = requestId
    setDatabaseUsers((current) => ({ ...current, status: 'loading', error: null }))
    try {
      const data = await api.listDatabaseUsers(connectionId, database)
      if (databaseUsersRequestRef.current !== requestId) return
      setDatabaseUsers({
        status: 'ready',
        users: data.users,
        roles: data.roles,
        logins: data.logins,
        error: null,
      })
    } catch (error) {
      if (databaseUsersRequestRef.current !== requestId) return
      setDatabaseUsers((current) => ({ ...current, status: 'error', error: error.message }))
    }
  }, [])

  const handleOpenDatabaseUsers = useCallback(() => {
    const current = activeSession()
    if (!current?.activeDatabase) return
    const info = (current.databases ?? []).find(
      (database) => database.name === current.activeDatabase,
    )
    if (!info?.isOnline || info.isSystem) return
    setDatabaseUsersOpen(true)
    loadDatabaseUsers(current.connectionId, current.activeDatabase)
  }, [activeSession, loadDatabaseUsers])

  const handleCloseDatabaseUsers = useCallback(() => {
    if (databaseUsersBusy) return
    databaseUsersRequestRef.current += 1
    setDatabaseUsersOpen(false)
    setDatabaseUsers(EMPTY_DATABASE_USERS)
  }, [databaseUsersBusy])

  const handleRefreshDatabaseUsers = useCallback(() => {
    const current = activeSession()
    if (!current?.activeDatabase) return
    loadDatabaseUsers(current.connectionId, current.activeDatabase)
  }, [activeSession, loadDatabaseUsers])

  const handleCreateDatabaseUser = useCallback(
    async (login, roles) => {
      const current = activeSession()
      if (!current?.activeDatabase) return false
      setDatabaseUsersBusy(true)
      setDatabaseUsers((value) => ({ ...value, error: null }))
      try {
        await api.createDatabaseUser({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          login,
          roles,
        })
        await loadDatabaseUsers(current.connectionId, current.activeDatabase)
        showBanner('success', `Created database user “${login}”.`)
        return true
      } catch (error) {
        setDatabaseUsers((value) => ({ ...value, error: error.message }))
        return false
      } finally {
        setDatabaseUsersBusy(false)
      }
    },
    [activeSession, loadDatabaseUsers, showBanner],
  )

  const handleUpdateDatabaseUserRoles = useCallback(
    async (user, roles) => {
      const current = activeSession()
      if (!current?.activeDatabase) return false
      setDatabaseUsersBusy(true)
      setDatabaseUsers((value) => ({ ...value, error: null }))
      try {
        await api.updateDatabaseUserRoles({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          user: user.name,
          roles,
        })
        await loadDatabaseUsers(current.connectionId, current.activeDatabase)
        showBanner('success', `Updated roles for “${user.name}”.`)
        return true
      } catch (error) {
        setDatabaseUsers((value) => ({ ...value, error: error.message }))
        return false
      } finally {
        setDatabaseUsersBusy(false)
      }
    },
    [activeSession, loadDatabaseUsers, showBanner],
  )

  const handleDropDatabaseUser = useCallback(
    async (user) => {
      const current = activeSession()
      if (!current?.activeDatabase) return false
      setDatabaseUsersBusy(true)
      setDatabaseUsers((value) => ({ ...value, error: null }))
      try {
        await api.dropDatabaseUser({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          user: user.name,
        })
        await loadDatabaseUsers(current.connectionId, current.activeDatabase)
        showBanner('success', `Dropped database user “${user.name}”.`)
        return true
      } catch (error) {
        setDatabaseUsers((value) => ({ ...value, error: error.message }))
        return false
      } finally {
        setDatabaseUsersBusy(false)
      }
    },
    [activeSession, loadDatabaseUsers, showBanner],
  )

  return {
    databaseUsersOpen,
    databaseUsers,
    databaseUsersBusy,
    handleOpenDatabaseUsers,
    handleCloseDatabaseUsers,
    handleRefreshDatabaseUsers,
    handleCreateDatabaseUser,
    handleUpdateDatabaseUserRoles,
    handleDropDatabaseUser,
  }
}
